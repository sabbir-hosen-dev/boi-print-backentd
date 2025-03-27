const express = require('express');
const cors = require('cors');
const mongodb = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion } = require('mongodb');
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
  baseUrl: process.env.PATHAO_BASE_URL || 'https://api-hermes.pathao.com',
  storeId: process.env.PATHAO_STORE_ID,
  defaultItemType: 2, // Parcel
  defaultDeliveryType: 48, // Standard delivery
};

// Pathao Token Middleware
const verifyPathaoToken = async (req, res, next) => {
  const now = Date.now();
  
  if (!pathaoAccessToken || now >= tokenExpirationTime) {
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
      tokenExpirationTime = now + (response.data.expires_in * 1000) - 60000; // 1 minute before expiration
      next();
    } catch (error) {
      console.error("Failed to get Pathao token:", error.response?.data || error.message);
      return res.status(500).json({ 
        success: false,
        error: "Failed to initialize Pathao service",
        details: error.response?.data || error.message
      });
    }
  } else {
    next();
  }
};

async function run() {
  try {
    console.log('Connected to MongoDB!');

    // Collections
    const UserData = client.db('BoiPrint').collection('UserData');
    const BannerData = client.db('BoiPrint').collection('BannerData');
    const OrderData = client.db('BoiPrint').collection('OrderData');
    const BookPrintData = client.db('BoiPrint').collection('BookPrintData');

    // ... [Keep all your existing routes unchanged] ...

    // Pathao Routes
    app.get('/api/pathao/access-token', async (req, res) => {
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
        tokenExpirationTime = Date.now() + (response.data.expires_in * 1000) - 60000;
        res.json({ success: true, token: pathaoAccessToken });
      } catch (error) {
        console.error("Pathao token error:", error.response?.data || error.message);
        res.status(500).json({ 
          success: false, 
          error: "Failed to get Pathao token",
          details: error.response?.data || error.message
        });
      }
    });

    app.get('/api/pathao/cities', verifyPathaoToken, async (req, res) => {
      try {
        const response = await axios.get(
          `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/city-list`,
          { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
        );
        res.json(response.data.data.data);
      } catch (error) {
        console.error("Pathao cities error:", error.response?.data || error.message);
        res.status(500).json({ 
          error: "Failed to fetch cities",
          details: error.response?.data || error.message
        });
      }
    });

    app.get('/api/pathao/zones/:cityId', verifyPathaoToken, async (req, res) => {
      try {
        const response = await axios.get(
          `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/cities/${req.params.cityId}/zone-list`,
          { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
        );
        res.json(response.data.data.data);
      } catch (error) {
        console.error("Pathao zones error:", error.response?.data || error.message);
        res.status(500).json({ 
          error: "Failed to fetch zones",
          details: error.response?.data || error.message
        });
      }
    });

    app.get('/api/pathao/areas/:zoneId', verifyPathaoToken, async (req, res) => {
      try {
        const response = await axios.get(
          `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/zones/${req.params.zoneId}/area-list`,
          { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
        );
        res.json(response.data.data.data);
      } catch (error) {
        console.error("Pathao areas error:", error.response?.data || error.message);
        res.status(500).json({ 
          error: "Failed to fetch areas",
          details: error.response?.data || error.message
        });
      }
    });

    app.post('/api/pathao/calculate-price', verifyPathaoToken, async (req, res) => {
      try {
        const { cityId, zoneId, itemWeight } = req.body;
        
        const response = await axios.post(
          `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/merchant/price-plan`,
          {
            store_id: PATHOA_CONFIG.storeId,
            item_type: PATHOA_CONFIG.defaultItemType,
            delivery_type: PATHOA_CONFIG.defaultDeliveryType,
            item_weight: itemWeight,
            recipient_city: cityId,
            recipient_zone: zoneId
          },
          { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
        );

        res.json(response.data.data);
      } catch (error) {
        console.error("Pathao price calculation error:", error.response?.data || error.message);
        res.status(500).json({ 
          error: "Failed to calculate delivery price",
          details: error.response?.data || error.message
        });
      }
    });

    app.post('/api/pathao/create-order', verifyPathaoToken, async (req, res) => {
      try {
        const { orderData } = req.body;
        
        // First create local order
        const orderResponse = await OrderData.insertOne({
          ...orderData,
          status: "Pending",
          createdAt: new Date(),
          updatedAt: new Date()
        });

        // Then create Pathao order
        const pathaoResponse = await axios.post(
          `${PATHOA_CONFIG.baseUrl}/aladdin/api/v1/orders`,
          {
            store_id: PATHOA_CONFIG.storeId,
            merchant_order_id: orderResponse.insertedId.toString(),
            recipient_name: orderData.customerName,
            recipient_phone: orderData.customerPhone,
            recipient_address: orderData.deliveryAddress,
            recipient_city: orderData.cityId,
            recipient_zone: orderData.zoneId,
            recipient_area: orderData.areaId,
            delivery_type: PATHOA_CONFIG.defaultDeliveryType,
            item_type: PATHOA_CONFIG.defaultItemType,
            item_quantity: 1,
            item_weight: orderData.itemWeight,
            amount_to_collect: orderData.amountToCollect,
            item_description: "Printed books"
          },
          { headers: { Authorization: `Bearer ${pathaoAccessToken}` } }
        );

        // Update local order with Pathao info
        await OrderData.updateOne(
          { _id: orderResponse.insertedId },
          { $set: { 
            pathaoOrderId: pathaoResponse.data.data.order_id,
            pathaoStatus: pathaoResponse.data.data.status,
            courierInfo: pathaoResponse.data.data.courier_info
          }}
        );

        res.json({
          success: true,
          orderId: orderResponse.insertedId,
          pathaoOrder: pathaoResponse.data.data
        });
      } catch (error) {
        console.error("Pathao order creation error:", error.response?.data || error.message);
        res.status(500).json({ 
          error: "Failed to create Pathao order",
          details: error.response?.data || error.message
        });
      }
    });

    app.get('/', (req, res) => {
      res.send('BoiPrint Server is running');
    });

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
}

run().catch(console.dir);