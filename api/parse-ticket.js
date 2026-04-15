module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "Falta configurar OPENAI_API_KEY en Vercel." });
    return;
  }

  try {
    const { imageDataUrl, existingItems = [] } = req.body || {};

    if (!imageDataUrl) {
      res.status(400).json({ error: "Falta la imagen del ticket." });
      return;
    }

    const catalogContext = existingItems
      .slice(0, 300)
      .map((item) => `${item.sku} | ${item.name} | ${item.category} | ${item.unit}`)
      .join("\n");

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Analiza este ticket de compra y devuelve solo datos útiles para inventario. " +
                  "Si un producto parece coincidir con un item existente del catálogo, devuelve su SKU en matchedSku. " +
                  "Si no estás seguro del SKU, devuelve matchedSku como null. " +
                  "Normaliza suggestedCategory a Cafetería, Insumos o Materiales. " +
                  "Normaliza unit a Kilogramo, Litro o Pieza. " +
                  "Si no se ve una cantidad explícita, usa 1. " +
                  "Catálogo actual:\n" +
                  catalogContext,
              },
              {
                type: "input_image",
                image_url: imageDataUrl,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "ticket_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                supplier: { type: ["string", "null"] },
                purchasedAt: { type: ["string", "null"] },
                total: { type: ["number", "null"] },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      quantity: { type: "number" },
                      unit: { type: "string" },
                      suggestedCategory: { type: "string" },
                      matchedSku: { type: ["string", "null"] },
                      lineTotal: { type: ["number", "null"] },
                    },
                    required: ["name", "quantity", "unit", "suggestedCategory", "matchedSku", "lineTotal"],
                  },
                },
              },
              required: ["supplier", "purchasedAt", "total", "items"],
            },
          },
        },
      }),
    });

    const responseJson = await openAiResponse.json();

    if (!openAiResponse.ok) {
      const apiMessage = responseJson.error?.message || "Error al analizar ticket con OpenAI.";
      res.status(openAiResponse.status).json({ error: apiMessage });
      return;
    }

    let parsed = null;

    if (responseJson.output_text) {
      parsed = JSON.parse(responseJson.output_text);
    } else {
      const textChunk = responseJson.output
        ?.flatMap((entry) => entry.content || [])
        ?.find((entry) => entry.type === "output_text")?.text;

      parsed = JSON.parse(textChunk || "{}");
    }

    res.status(200).json(parsed);
  } catch (error) {
    res.status(500).json({
      error: error.message || "No se pudo procesar el ticket.",
    });
  }
};
