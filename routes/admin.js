const router          = require('express').Router();
const { adminOnly }   = require('../middleware/auth');
const Transaction     = require('../models/Transaction');
const User            = require('../models/User');

router.use(adminOnly);

// GET /api/admin/deposits
router.get('/deposits', async (req, res) => {
  try {
    const deps = await Transaction.find({ type: 'deposit' }).sort({ createdAt: -1 }).lean();
    res.json(deps);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/admin/withdrawals
router.get('/withdrawals', async (req, res) => {
  try {
    const wds = await Transaction.find({ type: 'withdrawal' }).sort({ createdAt: -1 }).lean();
    res.json(wds);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/deposits/:id/approve
router.post('/deposits/:id/approve', async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.type !== 'deposit') return res.status(404).json({ error: 'Not found' });
    if (tx.status !== 'pending')       return res.status(400).json({ error: 'Already processed' });

    tx.status = 'approved';
    await tx.save();

    // Credit user balance
    const user = await User.findOne({ phone: tx.userPhone });
    if (user) {
      user.balance     += tx.amount;
      user.totalEarned += tx.amount;
      await user.save();
      // Pay 3-level referral commissions
      await payCommissions(tx.userPhone, tx.amount);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Approval failed' });
  }
});

// POST /api/admin/withdrawals/:id/mark-sent
router.post('/withdrawals/:id/mark-sent', async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.type !== 'withdrawal') return res.status(404).json({ error: 'Not found' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Already processed' });
    tx.status = 'sent';
    await tx.save();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ joined: -1 }).lean();
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── 3-level referral commission helper ──
async function payCommissions(depositorPhone, amount) {
  const depositor = await User.findOne({ phone: depositorPhone });
  if (!depositor?.referredBy) return;

  const l1 = await User.findOne({ phone: depositor.referredBy });
  if (!l1) return;
  l1.balance     += Math.round(amount * 0.10);
  l1.totalEarned += Math.round(amount * 0.10);
  await l1.save();

  if (!l1.referredBy) return;
  const l2 = await User.findOne({ phone: l1.referredBy });
  if (!l2) return;
  l2.balance     += Math.round(amount * 0.05);
  l2.totalEarned += Math.round(amount * 0.05);
  await l2.save();

  if (!l2.referredBy) return;
  const l3 = await User.findOne({ phone: l2.referredBy });
  if (!l3) return;
  l3.balance     += Math.round(amount * 0.01);
  l3.totalEarned += Math.round(amount * 0.01);
  await l3.save();
}

module.exports = router;
