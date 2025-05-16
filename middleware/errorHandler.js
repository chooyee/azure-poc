module.exports = function (err, req, res, next) {
    if (err.status === 419) {
      res.redirect(`/?error=${err}`);
    } else {
      next(err);
    }
  };

