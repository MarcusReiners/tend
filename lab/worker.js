// Das Modell rechnet in einem eigenen Thread, damit die Seite bedienbar bleibt.
import { WebWorkerMLCEngineHandler } from './web-llm.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
