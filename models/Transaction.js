const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userPhone: { type: String, required: true },
  userName:  { type: String, required: true },
  type:      { type: String, enum: ['deposit', 'withdrawal'], required: true },
  amount:    { type: Number, required: true },
  fee:       { type: Number, default: 0 },
  payout:    { type: Number, default: 0 },
  provider:  { type: String, default: 'MTN' },
  momoPhone: { type: String, default: '' },
  status:    { type: String, enum: ['pending', 'approved', 'rejected', 'sent'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Transaction', transactionSchema);
