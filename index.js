const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

//-------Firebase Admin Installation-------
const admin = require("firebase-admin");
const serviceAccount = require("./fbadmin-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors());
app.use(express.json());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

//-------Verify Token-------
const verifyToken = async (req, res, next) => {
  const token = req.headers?.authorization;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }

  try {
    const tokenID = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenID);
    req.tokenOwnerEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
};

app.get("/", (req, res) => {
  res.send("E-Tution Server is Running...!");
});

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("TutionBD_DB");
    const usersCollection = db.collection("users");
    const tutionsCollection = db.collection("tutions");
    const tutionApplicationsCollection = db.collection("tution-applications");

    // -------Get A User Role By Email-------
    app.get("/user/:email/role", async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.send({ message: "Email Ruquired" });
      }
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "student" });
    });

    //-------Post User-------
    app.post("/users", async (req, res) => {
      try {
        const existingUserQuery = { email: req.body.email };
        const existingUser = await usersCollection.findOne(existingUserQuery);
        if (existingUser) {
          return res.status(200).send({ message: "Existing user logged in" });
        }

        const newUser = {
          name: req.body?.name,
          email: req.body?.email,
          role: req.body?.role,
          phone: req.body?.phone,
          photoURL: req.body?.photoURL,
          uid: req.body?.uid,
        };
        if (req.body.role === "tutor") {
          newUser.verificationStatus = "not-verified";
        }
        newUser.createdAt = new Date();

        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // -------Get All User-------
    app.get("/users", verifyToken, async (req, res) => {
      try {
        const cursor = await usersCollection.find().sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Inernal Server Error" });
      }
    });

    // ----- Update Userinfo --------- ------- start here tomorrow (frontend my tution page and user management page)
    app.patch("/users/:id/update-info", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            name: req.body?.name,
            phone: req.body?.phone,
            photoURL: req.body?.photoURL,
          },
        };

        if (req.body?.verificationStatus) {
          update.$set.verificationStatus = "verified";
        }

        const result = await usersCollection.updateOne(query, update);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.code });
      }
    });

    //------- Change user role -------
    app.patch("/user/:id/role", async (req, res) => {
      try {
        const id = req.params.id;
        const role = req.query.role;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            role: role,
          },
        };
        const result = await usersCollection.updateOne(query, update);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.code });
      }
    });

    //------- Delete a user -------
    app.delete("/delete/user/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        await admin.auth().deleteUser(uid);
        console.log("user deleted from firebase");
        const query = { uid };
        const result = await usersCollection.deleteOne(query);
        if (!result) {
          return res.status(404).json({
            message: "User deleted from Firebase, but not found in MongoDB",
          });
        }
        res.send(result);
      } catch (err) {
        return res.status(500).send({ message: err.code });
      }
    });

    //-------Post Tution-------
    app.post("/post-tution", async (req, res) => {
      const newPost = req.body;
      (newPost.status = "pending"), (newPost.createdAt = new Date());
      const result = await tutionsCollection.insertOne(newPost);
      res.send(result);
    });

    //------- Get all tution post -------
    app.get("/all-tutions", async (req, res) => {
      try {
        const status = req.query.status;
        const query = {};
        if (status) {
          query.status = status;
        }
        const result = await tutionsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (err) {
        return res.status(500).send({ message: err.code });
      }
    });

    //------- Get all tution post -------
    app.get(`/tution/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tutionsCollection.findOne(query);
      res.send(result);
    });

    app.patch("/tution/update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const newStatus = req.query.status;
        const update = {
          $set: {
            status: newStatus,
          },
        };
        const result = await tutionsCollection.updateOne(query, update);
        res.send(result);
      } catch (err) {
        return res.status(500).send({ message: err.code });
      }
    });

    //-------My Tutions By Email-------
    app.get("/my-tutions/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };
        const cursor = await tutionsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //------- Update a tution post -------
    app.patch("/update/tution/:id", async (req, res) => {
      try {
        const id = req.params?.id;
        const query = { _id: new ObjectId(id) };
        const updatedPost = req.body;
        const result = await tutionsCollection.updateOne(query, {
          $set: updatedPost,
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.code });
      }
    });

    //------- Update a tution post (Add tutor email to array) -------
    app.patch("/update/tution/:id/appliedEmails", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const { tutorEmail } = req.body;

        const updateDoc = {
          $addToSet: {
            appliedEmails: tutorEmail,
          },
        };

        const result = await tutionsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    // ------ Delete Post api -------
    app.delete("/delete/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await tutionsCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.code });
      }
    });

    // ------- Post Tution Applications ----------
    app.post("/tution/applications", async (req, res) => {
      try {
        const newApplication = req.body;
        newApplication.applicationStatus = "pending";
        newApplication.appliedAt = new Date();

        const query = {
          tutorEmail: newApplication.tutorEmail,
          tutionPostId: newApplication.tutionPostId,
        };

        const alreadyApplied = await tutionApplicationsCollection.findOne(
          query
        );
        if (alreadyApplied) {
          return res
            .status(400)
            .send({ message: "You have already applied to this tution" });
        }

        const result = await tutionApplicationsCollection.insertOne(
          newApplication
        );
        res.send(result);
      } catch (err) {
        return res.status(500).send({ message: err.code });
      }
    });

    // ------- Get all application by tutorEmail email ----------
    app.get("/tution/applications/:email", async (req, res) => {
      console.log("hitting");
      try {
        const email = req.params.email;
        const cursor = tutionApplicationsCollection.find({
          tutorEmail: email,
        });
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        return res.status(500).send({ message: err.code });
      }
    });

    // ------- Update application info by id ----------
    app.patch("/update/application/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { experience, expectedSalary, qualification } = req.body;
        const updateFields = {};
        if (experience) {
          updateFields.experience = experience;
        }
        if (expectedSalary) {
          updateFields.expectedSalary = expectedSalary;
        }
        if (qualification) {
          updateFields.qualification = qualification;
        }
        console.log(updateFields);
        const updateDoc = {
          $set: updateFields,
        };
        const query = { _id: new ObjectId(id) };
        const result = await tutionApplicationsCollection.updateOne(
          query,
          updateDoc
        );
        res.send(result);
      } catch (err) {
        return res.status(500).send({ message: "Internal Server Error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
