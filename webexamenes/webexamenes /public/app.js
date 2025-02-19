let questions = [];
let currentQuestionIndex = 0;
let userAnswers = [];

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = document.getElementById('files').files;
    const numQuestions = document.getElementById('numQuestions').value;
    // const selectedModel = document.getElementById('modelSelector').value; // ELIMINADO

    if (files.length === 0) {
        alert('Por favor, selecciona al menos un archivo.');
        return;
    }

    // Mostrar mensaje de procesamiento
    document.getElementById('uploadForm').style.display = 'none';
    document.getElementById('processingMessage').style.display = 'block';

    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('files', file));
    formData.append('numQuestions', numQuestions);
    // formData.append('modelSelector', selectedModel); // Enviar el modelo seleccionado al backend - ELIMINADO

    // Enviar los archivos al backend
    const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
    });

    const data = await response.json();

    // Ocultar mensaje de procesamiento
    document.getElementById('processingMessage').style.display = 'none';

    if (!response.ok || !data.questions || data.questions.length === 0) {
        alert('No se pudieron generar preguntas. Asegúrate de subir archivos con contenido válido.');
        document.getElementById('uploadForm').style.display = 'block';
        return;
    }

    questions = data.questions;

    showCurrentQuestion();
    document.getElementById('questionsSection').style.display = 'block';
});

function showCurrentQuestion() {
    const questionContainer = document.getElementById('questionContainer');
    const currentQuestion = questions[currentQuestionIndex];

    // Mostrar el número de la pregunta actual y el total de preguntas
    const questionNumber = document.getElementById('questionNumber');
    questionNumber.innerText = `Pregunta ${currentQuestionIndex + 1} de ${questions.length}`;

    questionContainer.innerHTML = `
        <p>${currentQuestion.question}</p>
        <label>
            <input type="radio" name="answer" value="True"> Verdadero
        </label>
        <label>
            <input type="radio" name="answer" value="False"> Falso
        </label>
    `;

    document.getElementById('nextButton').disabled = false;
}

document.getElementById('nextButton').addEventListener('click', () => {
    const selectedAnswer = document.querySelector('input[name="answer"]:checked');

    if (!selectedAnswer) {
        currentQuestionIndex++;
        if (currentQuestionIndex < questions.length) {
            showCurrentQuestion();
        } else {
            showResults();
        }
        return;
    }

    userAnswers.push(selectedAnswer.value);
    currentQuestionIndex++;

    if (currentQuestionIndex < questions.length) {
        showCurrentQuestion();
    } else {
        showResults();
    }
});

function showResults() {
    let score = 0;
    const correctionsList = document.getElementById('corrections');
    correctionsList.innerHTML = '';

    questions.forEach((question, index) => {
        const userAnswer = userAnswers[index];

        if (userAnswer === undefined) {
            const li = document.createElement('li');
            li.innerText = `Pregunta: ${question.question} | Respuesta Correcta: ${question.answer} | No respondida`;
            li.classList.add('unanswered');
            correctionsList.appendChild(li);
            return;
        }

        const isCorrect = userAnswer === question.answer;
        if (isCorrect) {
            score++;
        } else {
            score--;
        }

        const li = document.createElement('li');
        li.innerText = `Pregunta: ${question.question} | Respuesta Correcta: ${question.answer} | Tu Respuesta: ${userAnswer}`;

        if (isCorrect) {
            li.classList.add('correct');
        } else {
            li.classList.add('incorrect');
        }

        correctionsList.appendChild(li);
    });

    document.getElementById('score').innerText = `Puntuación: ${score}/${questions.length}`;
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('questionsSection').style.display = 'none';
    document.getElementById('restartButton').style.display = 'block';
}

document.getElementById('restartButton').addEventListener('click', () => {
    questions = [];
    currentQuestionIndex = 0;
    userAnswers = [];

    document.getElementById('uploadForm').style.display = 'block';
    document.getElementById('processingMessage').style.display = 'none';
    document.getElementById('questionsSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('restartButton').style.display = 'none';
});