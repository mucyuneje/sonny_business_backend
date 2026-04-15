const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  price:       { type: Number, required: true },
  dailyReward: { type: Number, required: true },
  bought:      { type: Number, default: () => Date.now() },
  claimed:     { type: Boolean, default: false },
  claimedAt:   { type: Number, default: null },
  lastTick:    { type: Number, default: null },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  phone:       { type: String, required: true, unique: true, trim: true },
  email:       { type: String, default: '', trim: true },
  password:    { type: String, required: true },
  initials:    { type: String, default: '' },
  refCode:     { type: String, unique: true, sparse: true },
  referredBy:  { type: String, default: '' },  // phone of referrer
  balance:     { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  products:    { type: [productSchema], default: [] },
  joined:      { type: Date, default: Date.now },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
