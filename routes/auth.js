const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');

const makeToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

function makeRefCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

async function uniqueRefCode() {
  let code, exists = true;
  while (exists) { code = makeRefCode(); exists = await User.findOne({ refCode: code }); }
  return code;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, referralCode } = req.body;
    if (!name?.trim() || !phone?.trim() || !password) {
      return res.status(400).json({ error: 'Name, phone and password are required' });
    }
    if (phone.trim().length < 10)  return res.status(400).json({ error: 'Invalid phone number' });
    if (password.length < 6)       return res.status(400).json({ error: 'Password must be at least 6 characters' });

    if (await User.findOne({ phone: phone.trim() })) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }

    let referredBy = '';
    if (referralCode) {
      const referrer = await User.findOne({ refCode: referralCode.toUpperCase().trim() });
      if (referrer) referredBy = referrer.phone;
    }

    const initials = name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const refCode  = await uniqueRefCode();

    const user = await User.create({
      name: name.trim(), phone: phone.trim(), password,
      initials, refCode, referredBy,
    });

    res.status(201).json({
      token: makeToken(user._id),
      user: {
        _id: user._id, name: user.name, phone: user.phone,
        email: user.email, initials, refCode,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });

    const user = await User.findOne({ phone: phone.trim() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      token: makeToken(user._id),
      user: {
        _id: user._id, name: user.name, phone: user.phone,
        email: user.email, initials: user.initials, refCode: user.refCode,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;
