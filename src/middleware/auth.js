function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: "error", message: "Debes iniciar sesion." };
    return res.redirect("/login");
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    req.session.flash = { type: "error", message: "Acceso solo para administradores." };
    return res.redirect("/");
  }

  return next();
}

function requireAdminOrOperator(req, res, next) {
  if (!req.session.user || !["admin", "operator"].includes(req.session.user.role)) {
    req.session.flash = { type: "error", message: "Acceso restringido." };
    return res.redirect("/");
  }

  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireAdminOrOperator,
};
