import express from "express";
import cors from "cors"

const app = express();
const port = 3000;

app.use(cors());

app.post('/file-upload-test', async (req, res) => {

    await new Promise(resolve => setTimeout(resolve, 3000));
  
    res.set('Content-Type', 'application/json');
    res.send('{"success":true,"documentId":"1"}');
  })
  
app.post('/file-upload-test-fail', async (req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"success":false,"message":"Something went wrong"}');
});

app.get('/document-status', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"status":"scanning"}');
});

app.get('/document-delete', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('');
});

app.get('/document-status-fail', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"status":"scan-failed"}');
});

app.get('/document-status-downloadable', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"status":"downloadable"}');
});

app.get('/document-status-not-downloadable', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"status":"not-downloadable"}');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});