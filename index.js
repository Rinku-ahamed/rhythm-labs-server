const express = require("express");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6o5zgbq.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 30,
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  console.log(authorization);
  if (!authorization) {
    res.status(401).send({ error: true, message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
    if (error) {
      res.status(401).send({ error: true, message: "Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect((error) => {
      if (error) {
        console.error(error);
        return;
      }
    });

    const usersCollection = client.db("rhythmDB").collection("users");
    const classesCollection = client.db("rhythmDB").collection("classes");
    const paymentsCollection = client.db("rhythmDB").collection("payment");
    const enrolledCollection = client.db("rhythmDB").collection("enrolled");
    const selectedClassCollection = client
      .db("rhythmDB")
      .collection("selectedClass");

    app.post("/jwt", (req, res) => {
      const data = req.body;
      const token = jwt.sign({ data }, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });

      res.send({ token });
    });
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    //   get all the user by api

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    // user post api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get all the instructor by the api
    app.get("/instructors", async (req, res) => {
      const query = { role: "instructor" };
      const instructor = await usersCollection.find(query).toArray();
      res.send(instructor);
    });

    // get admin role api
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      if (result?.role === "admin") {
        res.send({ admin: true });
      } else {
        res.send({ admin: false });
      }
    });
    // get instructor role api
    app.get("/users/instructor/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      if (result?.role === "instructor") {
        res.send({ instructor: true });
      } else {
        res.send({ instructor: false });
      }
    });
    // get student role api
    app.get("/users/student/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      if (result?.role === "student") {
        res.send({ student: true });
      } else {
        res.send({ student: false });
      }
    });

    // get all classes by this api
    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });
    // get popular classes by this api
    app.get("/popularClasses", async (req, res) => {
      const query = { status: "approved" };
      const result = await classesCollection
        .find(query)
        .sort({
          totalEnrolledStudents: -1,
        })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // create api for add new class by instructor
    app.post("/class", async (req, res) => {
      const data = req.body;
      const result = await classesCollection.insertOne(data);
      res.send(result);
    });

    // get single classes api
    app.get("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await classesCollection.findOne(filter);
      res.send(result);
    });

    app.patch("/classes/seatsUpdate", async (req, res) => {
      const id = req.query.id;
      const filter = { _id: new ObjectId(id) };
      const exitingClass = await classesCollection.findOne(filter);
      let updatedSeats = {};
      if (exitingClass.seats != 0) {
        updatedSeats = {
          $set: { seats: exitingClass.seats - 1 },
        };
      }
      const result = await classesCollection.updateOne(filter, updatedSeats);
      res.send(result);
    });

    // payment related api
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      const selectedId = payment?.selectedClassId;
      const enrolledId = payment?.enrolledClassId;

      const filter = { _id: new ObjectId(enrolledId) };
      const options = {
        projection: {
          _id: 0,
          className: 1,
          classImage: 1,
          instructorEmail: 1,
          instructorName: 1,
          price: 1,
        },
      };
      const enrolledClass = await classesCollection.findOne(filter, options);
      console.log(enrolledClass);
      enrolledClass.email = payment?.email;
      // add enrolled data in enrolled collection
      const myEnrolledClass = await enrolledCollection.insertOne(enrolledClass);

      // updated total student enrolled filed
      const totalEnrolled = {
        $set: {
          totalEnrolledStudents: enrolledClass.totalEnrolledStudents + 1,
        },
      };
      const updatedEnrolledStudent = await classesCollection.updateOne(
        filter,
        totalEnrolled
      );

      // deleted after successfully payment
      const query = { _id: new ObjectId(selectedId) };
      const deleteResult = await selectedClassCollection.deleteOne(query);
      res.send({
        result,
        updatedEnrolledStudent,
        deleteResult,
        myEnrolledClass,
      });
    });

    app.get("/paymentHistory/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentsCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });
    // Create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // get student selected class api
    app.get("/selectedClass", async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    });

    // enrolled class get
    app.get("/enrolledClass/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const enrolledClass = await enrolledCollection.find(query).toArray();
      res.send(enrolledClass);
    });
    // student selected class api
    app.post("/selectedClass", async (req, res) => {
      const data = req.body;
      const result = await selectedClassCollection.insertOne(data);
      res.send(result);
    });
    app.delete("/selectedClass/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // updated classes api
    app.put("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const classData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          className: classData.className,
          price: parseFloat(classData.price),
          seats: parseInt(classData.seats),
        },
      };
      const result = await classesCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // update user role api
    app.patch("/users/roleUpdate", async (req, res) => {
      const userRole = req.query.role;
      const id = req.query.id;
      const filter = { _id: new ObjectId(id) };
      let updatedRole = {};
      if (userRole === "instructor") {
        updatedRole = {
          $set: {
            role: "instructor",
          },
        };
      } else if (userRole === "admin") {
        updatedRole = {
          $set: {
            role: "admin",
          },
        };
      }
      const result = await usersCollection.updateOne(filter, updatedRole);
      res.send(result);
    });

    app.patch("/classes/statusUpdate", async (req, res) => {
      const status = req.query.status;
      const id = req.query.id;
      const filter = { _id: new ObjectId(id) };
      let updatedStatus = {};
      if (status === "approved") {
        updatedStatus = {
          $set: {
            status: "approved",
          },
        };
      } else if (status === "deny") {
        updatedStatus = {
          $set: {
            status: "deny",
          },
        };
      }
      const result = await classesCollection.updateOne(filter, updatedStatus);
      res.send(result);
    });

    // update class feedback by api
    app.patch("/classes/feedback", async (req, res) => {
      const feedback = req.query.feed;
      const id = req.query.id;
      const filter = { _id: new ObjectId(id) };
      const updatedFeedback = {
        $set: {
          feedback: feedback,
        },
      };
      const result = await classesCollection.updateOne(filter, updatedFeedback);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Rhythm server running");
});

app.listen(port, () => {
  console.log(`My rhythm server running port is ${port}`);
});
