import "./loadEnv.js";
import app from "./app.js";

const port = process.env.PORT || 4000;
const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Gemini model: ${geminiModel}`);
});
