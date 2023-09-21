const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const fs = require('fs');
const path = require('path');

let userObj;
let somObj;
fs.readFile('som-users.json', 'utf8', (err, data) => {
	if (err) {console.error(err);return;}
		userObj = JSON.parse(data);
		console.log(userObj.admin.pw)
	});
	
fs.readFile('som-configurations.json', 'utf8', (err, data) => {
	if (err) {console.error(err);return;}
		somObj = JSON.parse(data);
		console.log(somObj)
	});

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: false }));

// Serve static files (HTML, CSS)
app.use(express.static(__dirname));

// Handle form submission
app.post('/submit', (req, res) => {
    const name = req.body.name;
    const passwd = req.body.passwd;
	const page = req.body.page
	var accessLevel = 0;
	
	console.log(name)
	console.log(passwd)
	console.log(userObj)
	
    if(name == 'admin'){
		if(userObj.admin.pw == passwd){
			//res.send(`Password Correct`);
			accessLevel = 1; 
		}
		
		else{
			res.send(`Password Incorrect`);
		}
	}
	

    // Respond to the user
	
	if(accessLevel = 1){
		const filePath = path.resolve(__dirname, 'admin.html');
		res.send(filePath)
		//res.render(__dirname + '/admin.html',{name:'abc'})
	}
	else{
		res.redirect('/')
	}
	   
});


// Start the server
const port = 3000;
const hostname = '192.168.8.101';
app.listen(port,hostname, () => {
    console.log(`Server is running on http://${hostname}:${port}`);
});
