import { vertexAI, TEXT_MODEL } from "../config/vertex.js";

export async function askAI(text) {
  const model = vertexAI.getGenerativeModel({ model: TEXT_MODEL });
  const result = await model.generateContent(text);
  return result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function askAIStream(history) {
  const model = vertexAI.getGenerativeModel({ model: TEXT_MODEL });
  return model.generateContentStream({ contents: history });
}
