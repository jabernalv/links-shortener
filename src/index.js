const path = require("path");
const express = require("express");
const session = require("express-session");
const morgan = require("morgan");
const { ensureDb } = require("./lib/db");
const { authRouter } = require("./routes/auth");
const { linksRouter } = require("./routes/links");

const app = express();
const PORT = process.env.PORT || 8085;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me-in-prod";
const APP_TZ = process.env.APP_TZ || undefined;

ensureDb();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Date helper for views: interprets SQLite timestamps (UTC) and formats in the desired timezone
const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: APP_TZ,
});
app.locals.formatDate = (ts) => {
  try {
    if (!ts) return "";
    // SQLite CURRENT_TIMESTAMP => 'YYYY-MM-DD HH:MM:SS' en UTC
    const iso = String(ts).replace(" ", "T") + "Z";
    return dateFormatter.format(new Date(iso));
  } catch {
    return String(ts);
  }
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan("dev"));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/tabler-icons",
  express.static(
    path.join(
      __dirname,
      "..",
      "node_modules",
      "@tabler",
      "icons-webfont",
      "dist"
    )
  )
);
app.use(
  "/vendor/chartjs",
  express.static(path.join(__dirname, "..", "node_modules", "chart.js", "dist"))
);

app.use("/", authRouter);
app.use("/", linksRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Internal server error");
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
