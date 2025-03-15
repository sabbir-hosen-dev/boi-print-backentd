const express = require("express");
const cors = require('cors');
const mongodb = require('mongodb');
const { v4: uuidv4 } = require('uuid');

// // Generate a random UUID
// const uniqueIDv4 = uuidv4();


const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(cors());



const { MongoClient, ServerApiVersion } = require('mongodb');
// const uri = "mongodb+srv://BoiPrint:BoiPrint@protfolio.i7miy.mongodb.net/BoiPrint?retryWrites=true&w=majority&appName=protfolio";
const uri = "mongodb+srv://boiprint7:znprH9zqqQINvdrc@cluster0.rgqji.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    console.log("Connected to MongoDB!");

    let UserData = client.db("BoiPrint").collection("UserData");
    let BannerData = client.db("BoiPrint").collection("BannerData");
    let OrderData = client.db("BoiPrint").collection("OrderData");
    let BookPrintData = client.db("BoiPrint").collection("BookPrintData");

    app.get('/users', async(req,res)=>{
      const query = req.query;
      const result = await UserData.find(query).toArray();
      res.send(result[0]);
    })

    app.post('/users', async (req, res) => {
      const { email, phoneNumber } = req.body;
      
      const existingUser = await UserData.findOne({ $or: [{ email }, { phoneNumber }] });
      
      if (existingUser) {
        const result = await UserData.updateOne(
          { _id: existingUser._id },
          { $set: { phoneNumber } }
        );
        res.send({ message: 'User found, phone number updated', result });
      } else {
        req.body.role = "user";
        const result = await UserData.insertOne(req.body);
        res.send({ message: 'New user added', result });
      }
    });

    app.put('/users', async(req,res)=>{
      const { email, ...updateData } = req.body; 
      const result = await UserData.updateOne(
        { email },
        { $set: updateData }, 
        { upsert: true }
      );
  
      res.send(result);
    })

    // admin dashboard
    app.get('/adminDashboard', async(req,res)=>{
      const totalUsers = await UserData.countDocuments();
      const pendingOrders = await OrderData.countDocuments({ status: 'Pending' });
      const deliveredOrders = await OrderData.countDocuments({ status: 'Delivered' });
      const processingOrders = await OrderData.countDocuments({ status: 'Processing' });
      const totalAmount = await OrderData.aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" }
          }
        }
      ]).toArray();
      const totalRevenue = totalAmount[0]?.totalAmount;
      

      const dashboard = {totalUsers, pendingOrders, deliveredOrders, processingOrders, totalRevenue}

      res.send(dashboard)
    })

    // admin all user
    app.get('/allUsers', async(req,res)=>{
      const result = await UserData.find().toArray();
      res.send(result);
    })

    // admin show user
    app.get('/allUsers/:id', async(req,res)=>{
      const id = req.params.id;
      const result = await UserData.findOne(new mongodb.ObjectId(id))
      res.send(result);
    })

    // admin role change
    app.put('/roleUpdate/:id', async(req,res)=>{
      console.log(req.params)
      const id = req.params.id;
      const role = req.body.role;
      const result = await UserData.updateOne({ _id: new mongodb.ObjectId(id) }, { $set: {role} } );
      res.send(result);
    })

    // admin all banner set
    app.get('/allBanners', async(req,res)=>{
      const query = req.query;
      const result = await BannerData.find(query).toArray();
      res.send(result);
    });
    
    app.post('/addBanner', async(req,res)=>{
      const result = await BannerData.insertOne(req.body);
      res.send({ message: 'New banner added', result });
    })

    app.delete('/deleteBanner/:id', async(req,res)=>{
      const id = req.params.id;
      const find = await BannerData.findOne({_id: new mongodb.ObjectId(id)});
      console.log(find)
      const result  = await BannerData.deleteOne({_id: new mongodb.ObjectId(id)})
      res.send(find);
    })

    // order details
    app.get('/allOrders', async(req,res)=>{
      const result = await OrderData.find().sort({ _id: -1 }).toArray();
      res.send(result);
    });

    app.put('/allOrders/:id', async(req,res)=>{
      const id = req.params.id;
      const newStatus = req.body.newStatus;

      console.log(id, newStatus)

      const result = await OrderData.updateOne(
        { orderID: id }, 
        { $set: { status: newStatus } },
        { upsert: false } 
      );
      res.send(result);
    })

    // admin order invoice
    app.get('/order-details/:id', async(req,res)=>{
      let result = await OrderData.findOne(new mongodb.ObjectId(req.params.id))
      res.send(result);
    })

    // user order history
    app.get('/orderHistory', async(req,res)=>{
      const email = req.query.email;
      let result = await OrderData.find({customerEmail: email}).toArray();
      res.send(result);
    })

    // book print demo data....
    app.get('/bookPrint', async(req,res)=>{
      const result = await BookPrintData.find().toArray();
      res.send(result);
    });

    app.put('/bookPrint', async(req, res)=>{
      const {coverType, printType} = req.body.updatedItem;
      const value = req.body.updatedItem.value;
      const result = await BookPrintData.updateOne({value},{$set: {coverType, printType}})
      res.send(result);
    })


    // order details
    app.post('/orderDetails', async(req,res)=>{
      const data = req.body;
      const date = new Date();
      const formattedDate = date.toLocaleDateString('en-GB').replace(/\//g, '-');

      const {address} = await UserData.findOne({email: data.email});

      const orderDetails = {
        customerEmail: data.email,
        location: address,
        orderID: "ORD-"+uuidv4().slice(0, 8),
        date: formattedDate,
        amount: data.totalPrice,
        status: "Pending",
        pdf: "url",
        coverType: data.coverType,
        paperType: data.paperType,
        selectedSize: data.selectedSize,
        quantity: data.quantity
      }

      const result = await OrderData.insertOne(orderDetails);
      res.send(result);
    })

    

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");


    app.get("/", (req, res) => {
      res.send("Root route is running");
    });

    // Start the server only after connecting to MongoDB
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



// app.use("/",(req,res)=>{
//     res.send("root route is running");
// })

// app.listen(port, ()=>{
//     console.log(`port ${port} is running`);
// })