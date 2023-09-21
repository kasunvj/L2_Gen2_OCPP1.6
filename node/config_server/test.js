const fs = require('fs');

fs.readFile('som-users.json', 'utf8', (err, data) => {
	  if (err) {console.error(err);return;}
	  console.log(JSON.parse(data).user.pw);
	});