import express from "express";
const app = express()
const port = 3000

app.post('/file-upload-test', (req, res) => {
  res.send('{"success":true,documentId:"1"}')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})