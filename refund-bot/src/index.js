require("dotenv").config();
const { App } = require("@slack/bolt");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Use Socket Mode in dev; remove socketMode + appToken for HTTP in prod
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Register all bot modules
require("./commands/refund")(app);
require("./actions/cx")(app);
require("./actions/school")(app);
require("./actions/techSupport")(app);
require("./actions/finance")(app);

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("Tap2Eat Refund Bot running on port", process.env.PORT || 3000);
})();
