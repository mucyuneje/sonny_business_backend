const router      = require('express').Router();
const { protect } = require('../middleware/auth');
const User        = require('../models/User');
const Transaction = require('../models/Transaction');

// ── GET /api/user/me ── fetch current user + tick rewards
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const now = Date.now();
    let changed = false;

    user.products.forEach(p => {
      if (!p.claimed) return;
      const lastTick = p.lastTick || p.claimedAt || now;
      const elapsed  = (now - lastTick) / 1000;
      if (elapsed > 10) {
        const earned = ((p.dailyReward || 0) / 86400) * Math.min(elapsed, 3600);
        user.balance     += earned;
        user.totalEarned += earned;
        p.lastTick = now;
        changed = true;
      }
    });

    if (changed) await user.save();

    const userObj = user.toObject();
    delete userObj.password;
    res.json(userObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/user/profile ──
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (name?.trim()) {
      user.name     = name.trim();
      user.initials = name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }
    if (email?.trim()) user.email = email.trim();
    if (newPassword && newPassword.length >= 6) user.password = newPassword;

    await user.save();
    res.json({ ok: true, name: user.name, initials: user.initials, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ── POST /api/user/buy-product ──
router.post('/buy-product', protect, async (req, res) => {
  try {
    const { name, price, dailyReward } = req.body;
    const user = await User.findById(req.user._id);

    if (user.products.some(p => p.name === name)) {
      return res.status(400).json({ error: 'Product already owned' });
    }
    if (user.balance < price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    user.balance -= price;
    user.products.push({ name, price, dailyReward, bought: Date.now(), claimed: false });
    await user.save();

    res.json({ ok: true, balance: user.balance, products: user.products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Purchase failed' });
  }
});

// ── POST /api/user/claim-product ──
router.post('/claim-product', protect, async (req, res) => {
  try {
    const { name } = req.body;
    const user = await User.findById(req.user._id);
    const p = user.products.find(pr => pr.name === name);

    if (!p)  return res.status(404).json({ error: 'Product not found' });
    if (p.claimed) return res.status(400).json({ error: 'Already claimed' });
    if (Date.now() - p.bought < 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Must wait 24 hours before claiming' });
    }

    p.claimed   = true;
    p.claimedAt = Date.now();
    p.lastTick  = Date.now();
    await user.save();

    res.json({ ok: true, products: user.products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Claim failed' });
  }
});

// ── POST /api/user/deposit ── submit deposit request
router.post('/deposit', protect, async (req, res) => {
  try {
    const { amount, provider } = req.body;
    if (!amount || amount < 1000) {
      return res.status(400).json({ error: 'Minimum deposit is 1,000 RWF' });
    }

    const tx = await Transaction.create({
      userId: req.user._id,
      userPhone: req.user.phone,
      userName:  req.user.name,
      type: 'deposit', amount,
      provider: provider || 'MTN',
      status: 'pending',
    });

    res.status(201).json({ ok: true, txId: tx._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit deposit' });
  }
});

// ── POST /api/user/withdraw ──
router.post('/withdraw', protect, async (req, res) => {
  try {
    const { amount, provider, momoPhone } = req.body;
    const user = await User.findById(req.user._id);

    if (!amount || amount < 2000) return res.status(400).json({ error: 'Minimum withdrawal is 2,000 RWF' });
    if (user.balance < amount)    return res.status(400).json({ error: 'Insufficient balance' });
    if (!user.products.some(p => p.claimed)) {
      return res.status(400).json({ error: 'Must own and claim at least one product to withdraw' });
    }

    const h = new Date().getHours();
    if (h < 9 || h >= 18) return res.status(400).json({ error: 'Withdrawals only available 9 AM – 6 PM' });

    const fee    = Math.round(amount * 0.20);
    const payout = amount - fee;

    user.balance -= amount;
    await user.save();

    const tx = await Transaction.create({
      userId: user._id, userPhone: user.phone, userName: user.name,
      type: 'withdrawal', amount, fee, payout,
      provider, momoPhone, status: 'pending',
    });

    res.json({ ok: true, txId: tx._id, balance: user.balance, payout });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit withdrawal' });
  }
});

// ── GET /api/user/transactions ──
router.get('/transactions', protect, async (req, res) => {
  try {
    const txs = await Transaction
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(txs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch transactions' });
  }
});

// ── GET /api/user/referrals ──
router.get('/referrals', protect, async (req, res) => {
  try {
    const myPhone = req.user.phone;
    const l1 = await User.find({ referredBy: myPhone }).select('name phone initials joined referredBy').lean();
    const l1Phones = l1.map(u => u.phone);
    const l2 = l1Phones.length
      ? await User.find({ referredBy: { $in: l1Phones } }).select('name phone initials joined referredBy').lean()
      : [];
    const l2Phones = l2.map(u => u.phone);
    const l3 = l2Phones.length
      ? await User.find({ referredBy: { $in: l2Phones } }).select('name phone initials joined referredBy').lean()
      : [];

    // Earnings from approved deposits
    const allPhones = [...l1Phones, ...l2Phones, ...l3.map(u => u.phone)];
    const approvedDeps = allPhones.length
      ? await Transaction.find({ type: 'deposit', status: 'approved', userPhone: { $in: allPhones } }).lean()
      : [];

    const l1Set = new Set(l1Phones);
    const l2Set = new Set(l2Phones);
    const l3Set = new Set(l3.map(u => u.phone));
    let earnL1 = 0, earnL2 = 0, earnL3 = 0;
    approvedDeps.forEach(dep => {
      if (l1Set.has(dep.userPhone))      earnL1 += dep.amount * 0.10;
      else if (l2Set.has(dep.userPhone)) earnL2 += dep.amount * 0.05;
      else if (l3Set.has(dep.userPhone)) earnL3 += dep.amount * 0.01;
    });

    res.json({
      l1, l2, l3,
      earnings: { earnL1, earnL2, earnL3, total: earnL1 + earnL2 + earnL3 },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch referrals' });
  }
});

module.exports = router;
