/* Server clock, so phones with the wrong date or time still show the right "now". Never cached. */
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ now: Date.now() });
};
