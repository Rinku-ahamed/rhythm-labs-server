const express = require("express");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { decode } = require("jsonwebtoken");
// middleware
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6o5zgbq.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    res.status(401).send({ error: true, message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[0];
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
    await client.connect();

    const usersCollection = client.db("rhythmDB").collection("users");
    const classesCollection = client.db("rhythmDB").collection("classes");
    const paymentsCollection = client.db("rhythmDB").collection("payment");
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

    // create api for add new class by instructor
    app.post("/class", async (req, res) => {
      const data = req.body;
      const result = await classesCollection.insertOne(data);
      res.send(result);
    });

    // updated classes api
    app.get("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await classesCollection.findOne(filter);
      res.send(result);
    });
    // payment related api
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
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
      console.log(feedback);
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
