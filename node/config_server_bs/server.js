const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: false }));

// Serve static files (HTML, CSS)
app.use(express.static(__dirname));

// Handle form submission
app.post('/submit', (req, res) => {
    const name = req.body.name;
    const email = req.body.email;

    // You can process the data here (e.g., save to a database)

    // Respond to the user
    res.send(`Thank you, ${name}, for submitting your email (${email}).`);
});

// Start the server
const port = 3000;
const hostname = '192.168.8.103';
app.listen(port,hostname, () => {
    console.log(`Server is running on http://${hostname}:${port}`);
});
