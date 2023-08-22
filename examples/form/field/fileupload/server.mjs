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
    res.send('{"status":"SCANNING"}');
});

app.delete('/document-delete', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('');
});

app.get('/document-status-fail', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"status":"MALWARE_DETECTED"}');
});

app.get('/document-status-downloadable', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"status":"DOWNLOADABLE","fileName":"testfile.pdf","size":9653413}');
});

app.get('/document-status-not-downloadable', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"status":"UN_DOWNLOADABLE","fileName":"testfile.pdf","size":9653413}');
});

app.get('/document-status-non-existent', async(req, res) => {
    res.set('Content-Type', 'application/json');
    res.send('{"status":"DELETED","fileName":"testfile.pdf","size":9653413}');
});

app.get('/document-status-fails', async(req, res) => {
    res.status(500);
    res.send('');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
