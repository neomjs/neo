import { KB_SearchService } from '../services.mjs';

async function testRag() {
    console.log('🔍 Testing RAG Service...');

    try {
        console.log('⏳ Waiting for service to be ready...');
        await KB_SearchService.ready(); 
        console.log('✅ Service Ready');
        
        const query = 'How do I use the Viewport component?';
        console.log('');
        console.log('❓ Asking: "' + query + '"');
        console.log('');

        const result = await KB_SearchService.ask({ query, limit: 3 });

        console.log('📝 Answer:');
        console.log(result.answer);

        console.log('');
        console.log('📚 References:');
        result.references.forEach((ref, i) => {
            console.log('   ' + (i + 1) + '. [' + Number(ref.score).toFixed(4) + '] ' + ref.name + ' (' + ref.source + ')');
        });

    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
    process.exit(0);
}

testRag();