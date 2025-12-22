require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_KEY);

//-------Firebase Admin Installation-------
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_ADMIN_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

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
    const paymentsCollection = db.collection("payments");

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
    app.patch("/users/:uid/update-info", async (req, res) => {
      try {
        const uid = req.params.uid;
        const query = { uid };

        await admin.auth().updateUser(uid, {
          displayName: req?.body?.name,
          photoURL: req.body.photoURL,
        });

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

    // ------ Delete application api -------
    app.delete("/delete/application/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await tutionApplicationsCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ------ Get applied tutors -------
    app.get("/applications/appliedTutors/:email", async (req, res) => {
      const query = { tuitonOwnerEmail: req.params?.email };
      const cursor = tutionApplicationsCollection
        .find(query)
        .sort({ appliedAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // ----- Payment Checkout -------
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseFloat(paymentInfo?.expectedSalary) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              unit_amount: amount,
              currency: "BDT",
              product_data: {
                name: `Pay for "${paymentInfo.subjectName}"`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          applicationId: paymentInfo?.applicationId,
          tutionPostId: paymentInfo?.tutionPostId,
          subjectName: paymentInfo?.subjectName,
          tutorEmail: paymentInfo?.tutorEmail,
        },
        customer_email: paymentInfo.tuitonOwnerEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/student/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/student/payment-cancelled`,
      });
      res.send({ url: session.url });
    });

    // verify payment
    app.patch("/verify-payment", async (req, res) => {
      const session_id = req.query?.session_id;
      const session = await stripe.checkout.sessions.retrieve(session_id);

      const payment_status = session?.payment_status;
      if (payment_status === "paid") {
        const applicationId = session.metadata.applicationId;
        const query = { _id: new ObjectId(applicationId) };
        const update = {
          $set: {
            applicationStatus: "approved",
          },
        };
        await tutionApplicationsCollection.updateOne(query, update);
        const transactionId = session.payment_intent;
        const paymentHistory = {
          paidAmount: session.amount_total / 100,
          payerEmail: session.customer_email,
          payedSubject: session.metadata.subjectName,
          payedTutionId: session.metadata.tutionPostId,
          paidApplicationId: session.metadata.applicationId,
          transactionId: session.payment_intent,
          tutorEmail: session.metadata.tutorEmail,
          paidAt: new Date(),
          paymentStatus: session.payment_status,
        };

        if (session.payment_status === "paid") {
          const query = { transactionId: transactionId };
          const existingPaymentHistory = await paymentsCollection.findOne(
            query
          );
          if (existingPaymentHistory) {
            return res.send({
              message: "Payment already found in history",
              transactionId: session.payment_intent,
            });
          }

          await paymentsCollection.insertOne(paymentHistory);

          const tutionPostId = session.metadata.tutionPostId;
          const tutionQuery = { _id: new ObjectId(tutionPostId) };
          const tutionUpdateDoc = {
            $set: {
              status: "assigned",
            },
          };

          const result = await tutionsCollection.updateOne(
            tutionQuery,
            tutionUpdateDoc
          );
          res.send(result);
        }
      }
    });

    // -------- Reject Tutor Application --------
    app.patch("/reject/application/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          applicationStatus: "rejected",
        },
      };
      const result = await tutionApplicationsCollection.updateOne(
        query,
        updateDoc
      );
      res.send(result);
    });

    //  ------ get payment tutors earnings -------
    app.get("/earnings/:email", async (req, res) => {
      const tutorEmail = req.params.email;
      const query = { tutorEmail: tutorEmail };
      const cursor = await paymentsCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

module.exports = app;
