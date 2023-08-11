import express from "express";
import cors from "cors"

const app = express()
const port = 3000

app.use(cors());

app.post('/file-upload-test', async (req, res) => {

  console.log(req.body);

  res.set('Content-Type', 'application/json');
  res.send('{"success":true,"documentId":"1"}')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})