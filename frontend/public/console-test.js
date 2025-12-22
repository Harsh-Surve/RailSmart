// Quick diagnostic tests - paste these into browser Console one at a time

// TEST 1: Fetch + Blob test
console.log('=== TEST 1: FETCH + BLOB ===');
fetch('http://localhost:5000/api/tickets/124/preview.png', { credentials: 'include' })
  .then(r => {
    console.log('✅ STATUS', r.status, 'CT:', r.headers.get('Content-Type'), 'ACAO:', r.headers.get('Access-Control-Allow-Origin'));
    return r.blob().then(b => {
      console.log('✅ BLOB size (bytes):', b.size, 'type:', b.type);
      return URL.createObjectURL(b);
    });
  })
  .then(u => {
    console.log('✅ OBJECT URL created, opening in new tab');
    window.open(u);
  })
  .catch(e => console.error('❌ FETCH ERROR', e));

// TEST 2: Image with use-credentials
console.log('\n=== TEST 2: IMAGE WITH USE-CREDENTIALS ===');
const img1 = new Image();
img1.crossOrigin = "use-credentials";
img1.onload = () => console.log('✅ IMG LOAD OK (use-credentials)');
img1.onerror = (e) => console.error('❌ IMG LOAD ERROR (use-credentials)', e);
img1.src = 'http://localhost:5000/api/tickets/124/preview.png';

// TEST 3: Image with anonymous
setTimeout(() => {
  console.log('\n=== TEST 3: IMAGE WITH ANONYMOUS ===');
  const img2 = new Image();
  img2.crossOrigin = "anonymous";
  img2.onload = () => console.log('✅ IMG LOAD OK (anonymous)');
  img2.onerror = (e) => console.error('❌ IMG LOAD ERROR (anonymous)', e);
  img2.src = 'http://localhost:5000/api/tickets/124/preview.png';
}, 2000);

// TEST 4: Image without crossOrigin
setTimeout(() => {
  console.log('\n=== TEST 4: IMAGE WITHOUT CROSSORIGIN ===');
  const img3 = new Image();
  img3.onload = () => console.log('✅ IMG LOAD OK (no crossOrigin)');
  img3.onerror = (e) => console.error('❌ IMG LOAD ERROR (no crossOrigin)', e);
  img3.src = 'http://localhost:5000/api/tickets/124/preview.png';
}, 4000);
