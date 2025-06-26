const express = require('express');
const cors = require('cors');
const mongodb = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

// // Generate a random UUID
// const uniqueIDv4 = uuidv4();

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId  } = require('mongodb');
const uri = process.env.MONGO_URL;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Pathao Configuration
let pathaoAccessToken = '';
let tokenExpirationTime = 0;
const PATHOA_CONFIG = {
  baseUrl: process.env.PATHAO_BASE_URL,
  storeId: process.env.PATHAO_STORE_ID,
  defaultItemType: 2,
  defaultDeliveryType: 48,
};
// Pathao Token Middleware
const verifyPathaoToken = async (req, res, next) => {
  const now = Date.now();
  console.log(`Token check - Current: ${pathaoAccessToken ? 'Exists' : 'Missing'}, Expires: ${new Date(tokenExpirationTime).toISOString()}`);

  if (!pathaoAccessToken || now >= tokenExpirationTime) {
    console.log('Getting new Pathao token...');
    try {
      const response = await axios.post(
        `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/issue-token`,
        {
          client_id: process.env.PATHAO_CLIENT_ID,
          client_secret: process.env.PATHAO_CLIENT_SECRET,
          grant_type: process.env.PATHAO_GRANT_TYPE || 'password',
          username: process.env.PATHAO_USERNAME,
          password: process.env.PATHAO_PASSWORD,
        }
      );

      pathaoAccessToken = response.data.access_token;
      tokenExpirationTime = now + response.data.expires_in * 1000 - 60000;
      console.log(`New token acquired. Expires at: ${new Date(tokenExpirationTime).toISOString()}`);
      next();
    } catch (error) {
      console.error('Failed to get Pathao token:', {
        config: error.config,
        response: error.response?.data,
        message: error.message
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize Pathao service',
        details: error.response?.data || error.message,
      });
    }
  } else {
    console.log('Using existing valid token');
    next();
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    console.log('Connected to MongoDB!');

    let UserData = client.db('BoiPrint').collection('UserData');
    let BannerData = client.db('BoiPrint').collection('BannerData');
    let OrderData = client.db('BoiPrint').collection('OrderData');
    let BookPrintData = client.db('BoiPrint').collection('BookPrintData');




    //-----------
    app.get('/users/check-user', async (req, res) => {
      try {
        const { email } = req.query;
        const user = await UserData.findOne({ email });
        res.json({ exists: !!user, user: user || null });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.post('/users', async (req, res) => {
      try {
        const { name, email, photo, uid, phoneNumber } = req.body;
        
        if (!name || !email || !uid) {
          return res.status(400).json({ message: 'Missing required fields' });
        }

        const existingUser = await UserData.findOne({ email });
        if (existingUser) {
          if (phoneNumber) {
            await UserData.updateOne(
              { email },
              { $set: { phoneNumber } }
            );
            existingUser.phoneNumber = phoneNumber;
          }
          return res.json({ 
            message: existingUser.phoneNumber ? 'User logged in' : 'User exists',
            user: existingUser 
          });
        }

        const newUser = {
          name,
          email,
          photo,
          uid,
          phoneNumber: phoneNumber || null,
          role: 'user',
          createdAt: new Date()
        };

        const result = await UserData.insertOne(newUser);
        const createdUser = { ...newUser, _id: result.insertedId };

        res.status(201).json({
          message: 'User created successfully',
          user: createdUser
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
      }
    });
    
// Other existing routes...


app.patch('/update-address', async (req, res) => {
  try {
    const { email, address } = req.body;
    
    // Update ONLY the address field in the user document
    const result = await User.findOneAndUpdate(
      { email },
      { 
        $set: { 
          'address': address // This updates just the address field
        } 
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

    app.get('/users', async (req, res) => {
      const query = req.query;
      const result = await UserData.find(query).toArray();
      res.send(result[0]);
    });

    app.get('/users/:email', async (req, res) => {
      try {
        const email = req.params.email; // Get email from URL params

        if (!email) {
          return res.status(400).json({ error: 'Email parameter is required' });
        }

        const user = await UserData.findOne({ email }); // Find user by email

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        res.json(user); // Send the user data
      } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

// GET user address by email
app.get("/address/:email", async (req, res) => {
  try {
    const email = req.params.email; 
    const user = await UserData.findOne({ email: email }).select('address');
    res.send(user)
  } catch (error) {
    console.error("Error fetching address:", error);
    res.status(500).json({ 
      error: "Internal server error",
      details: error.message 
    });
  }
});

    app.post('/users', async (req, res) => {
      const { email, phoneNumber } = req.body;

      const existingUser = await UserData.findOne({
        $or: [{ email }, { phoneNumber }],
      });

      if (existingUser) {
        const result = await UserData.updateOne(
          { _id: existingUser._id },
          { $set: { phoneNumber } }
        );
        res.send({ message: 'User found, phone number updated', result });
      } else {
        req.body.role = 'user';
        const result = await UserData.insertOne(req.body);
        res.send({ message: 'New user added', result });
      }
    });

    app.put('/users', async (req, res) => {
      const { email, ...updateData } = req.body;
      const result = await UserData.updateOne(
        { email },
        { $set: updateData },
        { upsert: true }
      );

      res.send(result);
    });

    // admin dashboard
    app.get('/adminDashboard', async (req, res) => {
      const totalUsers = await UserData.countDocuments();
      const pendingOrders = await OrderData.countDocuments({
        status: 'Pending',
      });
      const deliveredOrders = await OrderData.countDocuments({
        status: 'Delivered',
      });
      const processingOrders = await OrderData.countDocuments({
        status: 'Processing',
      });
      const totalAmount = await OrderData.aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
          },
        },
      ]).toArray();
      const totalRevenue = totalAmount[0]?.totalAmount;

      const dashboard = {
        totalUsers,
        pendingOrders,
        deliveredOrders,
        processingOrders,
        totalRevenue,
      };

      res.send(dashboard);
    });

    // admin all user
    app.get('/allUsers', async (req, res) => {
      const result = await UserData.find().toArray();
      res.send(result);
    });

    // admin show user
    app.get('/allUsers/:id', async (req, res) => {
      const id = req.params.id;
      const result = await UserData.findOne(new mongodb.ObjectId(id));
      res.send(result);
    });

    // admin role change
    app.put('/roleUpdate/:id', async (req, res) => {
      console.log(req.params);
      const id = req.params.id;
      const role = req.body.role;
      const result = await UserData.updateOne(
        { _id: new mongodb.ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    // admin all banner set
    app.get('/allBanners', async (req, res) => {
      const query = req.query;
      const result = await BannerData.find(query).toArray();
      res.send(result);
    });

    app.post('/addBanner', async (req, res) => {
      const result = await BannerData.insertOne(req.body);
      res.send({ message: 'New banner added', result });
    });

    app.delete('/deleteBanner/:id', async (req, res) => {
      const id = req.params.id;
      const find = await BannerData.findOne({ _id: new mongodb.ObjectId(id) });
      console.log(find);
      const result = await BannerData.deleteOne({
        _id: new mongodb.ObjectId(id),
      });
      res.send(find);
    });

    // order details
    app.get('/allOrders', async (req, res) => {
      const result = await OrderData.find().sort({ _id: -1 }).toArray();
      res.send(result);
    });

    app.put('/allOrders/:id', async (req, res) => {
      const id = req.params.id;
      const newStatus = req.body.newStatus;

      console.log(id, newStatus);

      const result = await OrderData.updateOne(
        { orderID: id },
        { $set: { status: newStatus } },
        { upsert: false }
      );
      res.send(result);
    });

    // admin order invoice
    app.get('/order-details/:id', async (req, res) => {
      let result = await OrderData.findOne(new mongodb.ObjectId(req.params.id));
      res.send(result);
    });

    // user order history
    app.get('/orderHistory', async (req, res) => {
      const email = req.query.email;
      let result = await OrderData.find({ customerEmail: email }).toArray();
      res.send(result);
    });

    // book print demo data....
    app.get('/bookPrint', async (req, res) => {
      const result = await BookPrintData.find().toArray();
      res.send(result);
    });

    app.put('/bookPrint', async (req, res) => {
      const { coverType, printType } = req.body.updatedItem;
      const value = req.body.updatedItem.value;
      const result = await BookPrintData.updateOne(
        { value },
        { $set: { coverType, printType } }
      );
      res.send(result);
    });

    // order details
    app.post('/orderDetails', async (req, res) => {
      const data = req.body;
      const date = new Date();
      const formattedDate = date
        .toLocaleDateString('en-GB')
        .replace(/\//g, '-');

      const { address } = await UserData.findOne({ email: data.email });

      const orderDetails = {
        ...data,
        customerEmail: data.email,
        location: address,
        orderID: 'ORD-' + uuidv4().slice(0, 8),
        date: formattedDate,
        amount: data.totalPrice,
        status: 'Pending',
        pdf: data.pdfUrl,
        coverType: data.coverType,
        paperType: data.paperType,
        selectedSize: data.selectedSize,
        quantity: data.quantity,
      };

      const result = await OrderData.insertOne(orderDetails);
      res.send(result);
    });

    // acess token
    app.get('/api/pathao/access-token', async (req, res) => {
      try {
        // console.log('Using base URL:', PATHOA_CONFIG.baseUrl);

        const response = await axios.post(
          `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/issue-token`,
          {
            client_id: process.env.PATHAO_CLIENT_ID,
            client_secret: process.env.PATHAO_CLIENT_SECRET,
            grant_type: process.env.PATHAO_GRANT_TYPE,
            username: process.env.PATHAO_USERNAME,
            password: process.env.PATHAO_PASSWORD,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          }
        );

        pathaoAccessToken = response.data.access_token;

        // Send a consistent response format
        res.json({
          success: true,
          token: response.data,
        });
      } catch (error) {
        console.error('Pathao token error:', {
          config: error.config,
          response: {
            status: error.response?.status,
            data: error.response?.data,
          },
          message: error.message,
        });

        // Send error response
        res.status(500).json({
          success: false,
          error: error.response?.data?.message || 'Failed to get access token',
        });
      }
    });

    // cities
    app.get('/api/pathao/cities', verifyPathaoToken, async (req, res) => {
      try {
        const response = await axios.get(
          `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/city-list`,
          { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
        );
        res.json(response.data.data.data);
      } catch (error) {
        console.error(
          'Pathao cities error:',
          error.response?.data || error.message
        );
        res.status(500).json({
          error: 'Failed to fetch cities',
          details: error.response?.data || error.message,
        });
      }
    });

    // zone

    app.get(
      '/api/pathao/zones/:cityId',
      verifyPathaoToken,
      async (req, res) => {
        try {
          const response = await axios.get(
            `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/cities/${req.params.cityId}/zone-list`,
            { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
          );
          res.json(response.data.data.data);
        } catch (error) {
          console.error(
            'Pathao zones error:',
            error.response?.data || error.message
          );
          res.status(500).json({
            error: 'Failed to fetch zones',
            details: error.response?.data || error.message,
          });
        }
      }
    );
    //zone id
    app.get(
      '/api/pathao/areas/:zoneId',
      verifyPathaoToken,
      async (req, res) => {
        try {
          const response = await axios.get(
            `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/zones/${req.params.zoneId}/area-list`,
            { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
          );
          res.json(response.data.data.data);
        } catch (error) {
          console.error(
            'Pathao areas error:',
            error.response?.data || error.message
          );
          res.status(500).json({
            error: 'Failed to fetch areas',
            details: error.response?.data || error.message,
          });
        }
      }
    );

    // calculate price
    app.post(
      '/api/pathao/calculate-price',
      verifyPathaoToken,
      async (req, res) => {
        try {
          const { cityId, zoneId, itemWeight } = req.body;

          // console.log(req.body)
          const response = await axios.post(
            `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/merchant/price-plan`,
            {
              // store_id: 148381,
              store_id: PATHOA_CONFIG.storeId,
              // item_type: PATHOA_CONFIG.defaultItemType,
              // delivery_type: PATHOA_CONFIG.defaultDeliveryType,
              item_type: 2,
              delivery_type: 48,
              //         item_weight: 5,
              item_weight: itemWeight,
              recipient_city: cityId,
              recipient_zone: zoneId,
            },
            { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
          );
          // console.log(response.data.data);
          res.json(response.data.data);
        } catch (error) {
          console.error(
            'Pathao price calculation error:',
            error.response?.data || error.message
          );
          res.status(500).json({
            error: 'Failed to calculate delivery price',
            details: error.response?.data || error.message,
          });
        }
      }
    );



    //mongodb oder save 
    app.post('/api/pathao/save-order', verifyPathaoToken, async (req, res) => {
  const orderData = req.body.orderData;

  try {
    const requiredFields = {
      customerName: 'Recipient name',
      customerPhone: 'Phone number',
      deliveryAddress: 'Delivery address',
      cityId: 'City',
      zoneId: 'Zone',
      areaId: 'Area'
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([field]) => !orderData[field])
      .map(([_, name]) => name);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        code: 'MISSING_FIELDS'
      });
    }

    const mongoOrder = {
      customerEmail: orderData.customerEmail,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      deliveryAddress: orderData.deliveryAddress,
      cityId: orderData.cityId,
      zoneId: orderData.zoneId,
      areaId: orderData.areaId,
      cityName: orderData.cityName,
      zoneName: orderData.zoneName,
      areaName: orderData.areaName,
      orderID: `ORD-${uuidv4().slice(0, 8)}`,
      date: new Date().toISOString(),
      amount: orderData.amountToCollect,
      status: 'Pending', // ❗ Only saved, not confirmed
      items: orderData.allData,
      quantity: orderData.quantity,
      weight: orderData.itemWeight,
      paymentMethod: orderData.paymentMethod,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mongoResult = await OrderData.insertOne(mongoOrder);

    return res.status(200).json({
      success: true,
      message: 'Order saved. Awaiting confirmation.',
      insertedId: mongoResult.insertedId,
      orderId: mongoOrder.orderID
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to save order',
      error: error.message
    });
  }
});

// order create pathau 
app.post('/api/pathao/confirm-order/:id', verifyPathaoToken, async (req, res) => {
  const { id } = req.params;

  try {
    const order = await OrderData.findOne({ _id: new ObjectId(id) });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const pathaoPayload = {
      store_id: process.env.PATHAO_STORE_ID || 148381,
      merchant_order_id: `ORD-${Date.now()}`,
      recipient_name: order.customerName,
      recipient_phone: order.customerPhone,
      recipient_address: `${order.deliveryAddress}, ${order.zoneName}, ${order.cityName}`,
      recipient_city: Number(order.cityId),
      recipient_zone: Number(order.zoneId),
      recipient_area: Number(order.areaId),
      delivery_type: 48,
      item_type: 2,
      item_quantity: order.quantity || 1,
      item_weight: `${order.weight || 1}`,
      amount_to_collect: Math.round(Number(order.amount) || 0),
      special_instruction: 'Handle with care',
      item_description: 'Printed materials'
    };

    const pathaoResponse = await axios.post(
      `${process.env.PATHAO_BASE_URL}/aladdin/api/v1/orders`,
      pathaoPayload,
      {
        headers: {
          Authorization: `Bearer ${pathaoAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    await OrderData.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          pathaoOrderId: pathaoResponse.data.data?.consignment_id,
          pathaoMerchantOrderId: pathaoPayload.merchant_order_id,
          pathaoStatus: pathaoResponse.data.data?.order_status || 'Pending',
          deliveryFee: pathaoResponse.data.data?.delivery_fee || 0,
          status: 'Confirmed',
          updatedAt: new Date()
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Order confirmed and sent to Pathao',
      pathaoOrder: pathaoResponse.data
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm order',
      error: error.response?.data || error.message
    });
  }
});





// order create endpoint
app.post('/api/pathao/create-order', verifyPathaoToken, async (req, res) => {
  const orderData = req.body.orderData;

  try {
    // Validate required fields with better error messages
    const requiredFields = {
      customerName: 'Recipient name',
      customerPhone: 'Phone number',
      deliveryAddress: 'Delivery address',
      cityId: 'City',
      zoneId: 'Zone',
      areaId: 'Area'
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([field]) => !orderData[field])
      .map(([_, name]) => name);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        code: 'MISSING_FIELDS'
      });
    }

    // Validate phone number format
    if (!/^01[3-9]\d{8}$/.test(orderData.customerPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Bangladeshi phone number format (must be 11 digits starting with 01)',
        code: 'INVALID_PHONE'
      });
    }

    // Prepare Pathao payload
    const pathaoPayload = {
      store_id: process.env.PATHAO_STORE_ID || 148381, // Use env variable
      merchant_order_id: `ORD-${Date.now()}`,
      recipient_name: orderData.customerName,
      recipient_phone: orderData.customerPhone,
      recipient_address: `${orderData.deliveryAddress}, ${orderData.zoneName}, ${orderData.cityName}`,
      recipient_city: Number(orderData.cityId),
      recipient_zone: Number(orderData.zoneId),
      recipient_area: Number(orderData.areaId),
      delivery_type: 48, // Normal delivery
      item_type: 2, // Parcel
      item_quantity: orderData.quantity || 1,
      item_weight: `${orderData.itemWeight || 1}`,
      amount_to_collect: Math.round(Number(orderData.amountToCollect) || 0),
      special_instruction: orderData.specialInstructions || 'Handle with care',
      item_description: 'Printed materials'
    };

    // Create Pathao order
    const pathaoResponse = await axios.post(
      `${process.env.PATHAO_BASE_URL}/aladdin/api/v1/orders`,
      pathaoPayload,
      {
        headers: {
          Authorization: `Bearer ${pathaoAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    // Prepare MongoDB order document
    const mongoOrder = {
      customerEmail: orderData.customerEmail,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      deliveryAddress: orderData.deliveryAddress,
      cityId: orderData.cityId,
      zoneId: orderData.zoneId,
      areaId: orderData.areaId,
      cityName: orderData.cityName,
      zoneName: orderData.zoneName,
      areaName: orderData.areaName,
      orderID: `ORD-${uuidv4().slice(0, 8)}`,
      date: new Date().toISOString(),
      amount: orderData.amountToCollect,
      status: 'Pending',
      items: orderData.allData,
      quantity: orderData.quantity,
      weight: orderData.itemWeight,
      paymentMethod: orderData.paymentMethod,
      pathaoOrderId: pathaoResponse.data.data?.consignment_id,
      pathaoMerchantOrderId: pathaoPayload.merchant_order_id,
      pathaoStatus: pathaoResponse.data.data?.order_status || 'Pending',
      deliveryFee: pathaoResponse.data.data?.delivery_fee || 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to MongoDB
    const mongoResult = await OrderData.insertOne(mongoOrder);

    return res.status(200).json({
      success: true,
      data: {
        pathaoOrder: pathaoResponse.data,
        mongoOrder: {
          insertedId: mongoResult.insertedId,
          orderId: mongoOrder.orderID
        }
      }
    });

  } catch (error) {
    console.error('Order creation error:', {
      error: error.response?.data || error.message,
      stack: error.stack
    });

    let statusCode = 500;
    let errorMessage = 'Order creation failed';
    let errorDetails = null;

    if (error.response) {
      statusCode = error.response.status;
      errorMessage = error.response.data?.message || errorMessage;
      errorDetails = error.response.data?.errors;
      
      // Handle Pathao-specific errors
      if (error.response.data?.errors) {
        errorMessage = Object.entries(error.response.data.errors)
          .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
          .join('; ');
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - Pathao API took too long to respond';
      statusCode = 504;
    }

    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
      details: errorDetails,
      code: error.response?.data?.code || 'ORDER_CREATION_FAILED'
    });
  }



});












    
    app.get('/', (req, res) => {
      res.send('Root route is running');
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
