const key = process.argv[2];
if (!key) {
    console.log('Usage: node decode-jwt.js <key>');
    process.exit(1);
}

try {
    const parts = key.split('.');
    if (parts.length !== 3) {
        console.log('Invalid JWT format');
        process.exit(1);
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log(JSON.stringify(payload, null, 2));
} catch (e) {
    console.error('Error decoding JWT:', e.message);
}
