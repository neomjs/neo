export default function chunkPath(number) {
    return String(number).padStart(4, '0').slice(0, -2) + 'xx';
}
