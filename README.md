# Control de Insumos

Aplicacion web estatica para llevar un control sencillo de:

- catalogo de SKUs
- compras de insumos
- salidas o consumo
- stock actual
- fecha de agotado
- categorias fijas: Cafetería, Insumos y Materiales
- SKU consecutivo generado automaticamente
- importacion masiva por archivos CSV compatibles con Excel
- conexion directa con Supabase desde el navegador
- lectura de tickets por foto usando OpenAI en un endpoint de Vercel

## Uso

1. Crea tu proyecto y tablas en Supabase.
2. Abre `supabase-config.js` y pega:
   - `url`: Project URL
   - `anonKey`: anon public key
3. Abre `index.html` en el navegador.
4. Da de alta tus insumos en la seccion de catalogo.
5. Registra compras y salidas.
6. Si vas a usar lectura de tickets, en Vercel agrega la variable `OPENAI_API_KEY`.
7. La informacion se guarda en Supabase.

## Notas

- No requiere backend propio para empezar.
- Para leer tickets por foto, la app usa `api/parse-ticket.js`, que requiere despliegue en Vercel.
- Necesitas que Supabase tenga las tablas `items`, `purchases` y `usages`.
- Si activas RLS, usa politicas que permitan las operaciones que hace la app.
- El costo se muestra en MXN.
