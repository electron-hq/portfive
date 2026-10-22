const Subscription = require('../models/Subscription');
const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:test@portfive.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const subscribe = async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      console.log('Push Error: Invalid subscription object');
      return res.status(400).json({ message: 'Invalid subscription object' });
    }

    const existing = await Subscription.findOne({ 
      user: req.user.id, 
      'subscription.endpoint': subscription.endpoint 
    });

    if (!existing) {
      await Subscription.create({ user: req.user.id, subscription });
      console.log(`✅ Push Subscription saved for user: ${req.user.id}`);
    } else {
      console.log(`ℹ️ Push Subscription already exists for user: ${req.user.id}`);
    }

    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const sendPushNotification = async (userId, payload) => {
  try {
    console.log(`🔔 Attempting to send push to User: ${userId}`);
    const subscriptions = await Subscription.find({ user: userId });
    
    if (!subscriptions || subscriptions.length === 0) {
      console.log(`⚠️ No subscriptions found for User: ${userId}`);
      return;
    }

    const pushPayload = JSON.stringify(payload);
    
    const sendPromises = subscriptions.map(async (sub) => {
      try {
        console.log(`🚀 Sending push to endpoint: ${sub.subscription.endpoint.substring(0, 50)}...`);
        await webpush.sendNotification(sub.subscription, pushPayload);
        console.log(`✅ Push sent successfully to User: ${userId}`);
      } catch (error) {
        console.error(`❌ Push send error for User ${userId}:`, error.statusCode, error.body || error.message);
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`🗑️ Removing expired subscription: ${sub._id}`);
          await Subscription.findByIdAndDelete(sub._id);
        }
      }
    });

    await Promise.all(sendPromises);
  } catch (error) {
    console.error('Send push notification error:', error);
  }
};

module.exports = { subscribe, sendPushNotification };
