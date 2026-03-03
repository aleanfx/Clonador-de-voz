export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { endpointUrl, apiKey, input } = req.body;

        if (!endpointUrl || !input) {
            return res.status(400).json({ error: 'Missing endpointUrl or input in body' });
        }

        // Forward the request to RunPod
        // Vercel backend will NOT send 'Content-Encoding: br' by default for standard JSON fetch
        const fetchHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (apiKey) {
            fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
        }

        const runpodResponse = await fetch(endpointUrl, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify({ input: input })
        });

        const runpodData = await runpodResponse.json();
        return res.status(runpodResponse.status).json(runpodData);

    } catch (error) {
        console.error("Vercel Proxy Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
