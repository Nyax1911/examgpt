require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Configuración del SDK de Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Usar la clave de API de Gemini

// Modelos Gemini, usando getGenerativeModel como en la documentación
const modelGeminiPro = genAI.getGenerativeModel({ model: "gemini-pro" }); // Modelo Gemini Pro
// const modelGeminiFlash = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Modelo Gemini Flash 2.0 - ELIMINADO


const app = express();

// Configuración de multer para guardar archivos en la carpeta /upload/
const uploadDir = path.join(__dirname, 'upload');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.odt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido.'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

app.use(express.json());
app.use(express.static('public'));

// Función para mezclar un array (Fisher-Yates Shuffle)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Endpoint para subir múltiples archivos
app.post('/upload', upload.array('files'), async (req, res) => {
    try {
        const numQuestions = parseInt(req.body.numQuestions, 10);
        // const selectedModel = req.body.modelSelector; // Modelo seleccionado por el usuario - ELIMINADO
        const uploadedFiles = req.files;

        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json({ error: 'No se subieron archivos.' });
        }

        let combinedText = '';
        const savedFiles = [];

        for (const file of uploadedFiles) {
            const ext = path.extname(file.originalname).toLowerCase();
            savedFiles.push({
                originalname: file.originalname,
                savedName: file.filename,
                path: file.path
            });

            if (ext === '.pdf') {
                console.log(`Procesando archivo PDF: ${file.originalname}`);
                const filePath = path.join(uploadDir, file.filename);
                const pdfBuffer = fs.readFileSync(filePath);
                const pdfText = (await pdfParse(pdfBuffer)).text;

                if (!pdfText.trim()) {
                    console.warn(`El archivo PDF ${file.originalname} no contiene texto extraíble.`);
                    continue;
                }

                combinedText += filterRelevantContent(pdfText) + '\n';
            }
        }

        if (!combinedText.trim() && numQuestions > 0) {
            return res.status(400).json({ error: 'No se pudo extraer contenido relevante de los archivos PDF subidos.' });
        }

        let finalQuestions = [];
        if (numQuestions > 0) {
            console.log(`Texto combinado extraído:\n${combinedText.slice(0, 500)}...`);
            finalQuestions = await generateExactNumberOfQuestions(combinedText, numQuestions); // MODELO YA NO SE PASA

            if (finalQuestions.length === 0) {
                return res.status(400).json({ error: 'No se pudieron generar preguntas a partir del contenido de los archivos subidos.' });
            }

            // finalQuestions = shuffleArray(finalQuestions); // Mezclado desactivado previamente

        }

        res.json({ message: 'Archivos subidos correctamente.', files: savedFiles, questions: finalQuestions });
    } catch (error) {
        console.error('Error al subir archivos o generar preguntas:', error);
        res.status(500).json({ error: 'Ocurrió un error al procesar los archivos.' });
    }
});

// Función para filtrar contenido irrelevante del PDF
function filterRelevantContent(text) {
    const lines = text.split('\n').filter(line => line.trim().length > 30);
    return lines.join('\n');
}

// Función para generar exactamente el número solicitado de preguntas con Gemini API
async function generateExactNumberOfQuestions(text, numQuestions) { // MODELO YA NO SE RECIBE COMO PARÁMETRO
    try {
        // let geminiModel; // YA NO NECESITAMOS SELECCIÓN
        // if (model === 'gemini-flash') {    // Lógica de selección eliminada
        //     geminiModel = modelGeminiFlash; // Usar Gemini Flash 2.0
        // } else {
            geminiModel = modelGeminiPro; // Usar Gemini Pro SIEMPRE
        // }

        const prompt = `
Eres un asistente experto en generar preguntas basadas en el contenido proporcionado. Tu objetivo es crear preguntas que sean extremadamente difíciles y desafiantes, requiriendo una comprensión profunda y minuciosa del texto.  Las preguntas deben ser:

- Originales: Evita la repetición de ideas o frases del texto original de manera obvia.
- Muy Difíciles: Las preguntas deben ser intrincadas, demandando inferencias, análisis detallado y atención a los matices del texto.  Algunas preguntas deben centrarse en detalles sutiles o información implícita.
- Altamente Engañosas: Incluye respuestas falsas que sean extremadamente plausibles.  Las alteraciones en las preguntas falsas deben ser **muy sutiles y casi imperceptibles a una lectura rápida**, utilizando **sinónimos, paráfrasis, cambios numéricos menores, o alteraciones en relaciones sutiles (causa/efecto, orden cronológico, etc.)** que fácilmente podrían pasarse por alto si no se lee con extrema atención.

Instrucciones:
- Genera exactamente ${numQuestions} preguntas.
- **Todas las preguntas deben ser formuladas para que la respuesta sea SÍ o NO, o VERDADERO o FALSO.**
- Cada pregunta debe estar basada en detalles específicos del texto proporcionado, pero formulada de manera que no sea una copia directa.
- Incluye una mezcla de preguntas verdaderas y falsas.
- Para las preguntas falsas, altera información clave del texto de forma **muy sutil** para que parezcan verdaderas a primera vista, pero sean incorrectas tras un análisis extremadamente cuidadoso.  Concéntrate en detalles pequeños, relaciones sutiles, o inferencias lógicas que puedan inducir a error incluso a lectores atentos.
- No uses signos de interrogación (¿ o ?) en las preguntas.
- Proporciona una respuesta para cada pregunta indicando "True" (verdadera) o "False" (falsa).
- Asegúrate de que las preguntas sean claras en su formulación, pero extremadamente desafiantes en su respuesta.

Formato esperado:
1. Pregunta 1 - True
2. Pregunta 2 - False
3. Pregunta 3 - True
...

Texto:
${text}
        `;

        const result = await modelGeminiPro.generateContent(prompt); // USAMOS DIRECTAMENTE modelGeminiPro
        const responseContent = result.response.text();


        console.log(`Respuesta del modelo Gemini:\n${responseContent}`);

        const parsedQuestions = parseQuestions(responseContent);

        if (parsedQuestions.length < numQuestions) {
            console.warn(`Solo se generaron ${parsedQuestions.length} preguntas de las ${numQuestions} solicitadas.`);
        }

        return parsedQuestions.slice(0, numQuestions);
        //return parsedQuestions; // Otra opción si no quieres limitar el número al final, sino devolver todas las parseadas
         } catch (error) {
        console.error('Error al generar preguntas con Gemini:', error);
        return [];
    }
}

// Función auxiliar para parsear las preguntas generadas por Gemini (ajustado para el formato Gemini)
function parseQuestions(responseContent) {
    const lines = responseContent.split('\n');
    const questions = lines
        .filter(line => line.trim().match(/^\d+\.\s*.+\-\s*(True|False)$/i)) // Filtrar preguntas sin signos de interrogación, case-insensitive
        .map((line, index) => {
            const [questionText, answer] = line.trim().split(' - ');
            const cleanQuestion = questionText.replace(/^\d+\.\s*/, '').replace(/[¿?]/g, '');
            return {
                question: cleanQuestion.trim(),
                answer: answer.trim().toLowerCase() === 'true' ? 'True' : 'False' // Asegurar respuestas en "True" o "False"
            };
        });
    return questions;
}


// Iniciar el servidor
const PORT = 7002;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));