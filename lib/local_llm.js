/**
 * lib/local_llm.js
 * Wrapper for Local LLM interaction via Ollama (http://localhost:11434)
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

/**
 * Checks if Ollama server is reachable and if the specified model is installed.
 * @param {string} modelName - Name of the Ollama model (e.g. 'llama3.1', 'mistral')
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function checkOllamaAvailability(modelName = DEFAULT_MODEL) {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            return {
                success: false,
                message: `Ollama returned HTTP status ${response.status}. Please check if Ollama is running properly at ${OLLAMA_BASE_URL}.`
            };
        }

        const data = await response.json();
        const models = data.models || [];
        
        const isModelAvailable = models.some(m => {
            const name = (m.name || '').toLowerCase();
            const target = modelName.toLowerCase();
            return name === target || name.startsWith(`${target}:`);
        });

        if (!isModelAvailable) {
            const availableNames = models.map(m => m.name).join(', ') || 'None';
            return {
                success: false,
                message: `Ollama is running, but model '${modelName}' was not found. Installed models: [${availableNames}]. Please run: ollama pull ${modelName}`
            };
        }

        return {
            success: true,
            message: `Ollama is active and model '${modelName}' is ready.`
        };

    } catch (err) {
        return {
            success: false,
            message: `Ollama server is not reachable at ${OLLAMA_BASE_URL}. Please start Ollama application or service. (Error: ${err.message})`
        };
    }
}

/**
 * Generates text using Ollama /api/generate endpoint.
 * @param {string} prompt - Input prompt string
 * @param {string} modelName - Model name to use
 * @returns {Promise<string>} Generated text output
 */
async function generateText(prompt, modelName = DEFAULT_MODEL) {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        return (data.response || '').trim();

    } catch (err) {
        console.error('Ollama generate error:', err);
        throw new Error(`Failed to generate response from local LLM (${modelName}): ${err.message}`);
    }
}

module.exports = {
    OLLAMA_BASE_URL,
    DEFAULT_MODEL,
    checkOllamaAvailability,
    generateText
};
