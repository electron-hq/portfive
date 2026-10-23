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
      return res.status(400).json({ message: 'Invalid subscription object' });
    }

    // Upsert: Update if exists, insert if not (prevents duplicates but ensures latest keys)
    await Subscription.findOneAndUpdate(
      { user: req.user.id, 'subscription.endpoint': subscription.endpoint },
      { user: req.user.id, subscription },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'Endpoint is required' });

    await Subscription.findOneAndDelete({ user: req.user.id, 'subscription.endpoint': endpoint });
    res.status(200).json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const sendPushNotification = async (userId, payload) => {
  try {
    const subscriptions = await Subscription.find({ user: userId });
    if (!subscriptions || subscriptions.length === 0) return;

    const pushPayload = JSON.stringify(payload);

    const sendPromises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, pushPayload);
      } catch (error) {
        // If subscription is invalid/expired (410 Gone or 404 Not Found), remove it
        if (error.statusCode === 410 || error.statusCode === 404) {
          await Subscription.findByIdAndDelete(sub._id);
        } else {
          console.error('Push send error:', error);
        }
      }
    });

    await Promise.all(sendPromises);
  } catch (error) {
    console.error('Send push notification error:', error);
  }
};

module.exports = { subscribe, unsubscribe, sendPushNotification };
