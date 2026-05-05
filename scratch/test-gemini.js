const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });

async function test() {
  try {
    // Specify the API version explicitly if possible, though SDK usually handles it
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    console.log('Sending request to gemini-1.5-flash...');
    const result = await model.generateContent("Olá");
    console.log('SUCCESS:', (await result.response).text());
  } catch (err) {
    console.error('FAILURE:', err);
  }
}

test();
