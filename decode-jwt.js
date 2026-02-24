const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkb3VmeXRnaWtsZ2dzaXpnZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDIxMjIsImV4cCI6MjA4NzUxODEyMn0.ynG9VfAkFyOHcyO_ZRIAONX9mCtqXbSxQTnSV7woV3Q';
const payload = jwt.split('.')[1];
const decoded = Buffer.from(payload, 'base64').toString();
console.log(decoded);
