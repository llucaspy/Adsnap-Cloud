import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSpacePackage, spaceDocumentMatches } from '../src/lib/spaceCreativePackage'

const token = (cr = 23, ca = 1, pl = 45) => Buffer.from(JSON.stringify({ ca, cr, pl })).toString('base64')
const loader = (cr = 23) => `https://00px.net/target/${token(cr)}/planet.js?m=private-preview`
const body = (cr = 23) => `space.planets.x.setToken('${token(cr)}').setUrl('https://cdn.00px.net/rocket/${cr}/index.html?t=cache');`

test('uses the current loader identity and its actual response, preserving no preview query', () => {
    assert.equal(parseSpacePackage(loader(), body()), 'https://cdn.00px.net/rocket/23/index.html')
    assert.equal(parseSpacePackage(loader(24), body(24)), 'https://cdn.00px.net/rocket/24/index.html')
    assert.equal(parseSpacePackage(loader(24), body()), undefined)
})
test('rejects mismatched campaign/placement, multiple packages and unexpected script bodies', () => {
    for (const script of [body().replace(token(), token(23, 2)), body().replace(token(), token(23, 1, 46)), body()+body(), '<html>Forbidden</html>', 'x'.repeat(129*1024)]) {
        assert.equal(parseSpacePackage(loader(), script), undefined)
    }
})
test('rejects untrusted loader or document destinations, credentials and different asset identities', () => {
    for (const raw of [loader().replace('00px.net','00px.net.evil.invalid'),loader().replace('https:','http:'),loader().replace('https://','https://user:password@'),loader().replace('/target/','/unrelated/')]) assert.equal(parseSpacePackage(raw,body()),undefined)
    for (const raw of [body().replace('cdn.00px.net','127.0.0.1'),body().replace('cdn.00px.net','cdn.00px.net.evil.invalid'),body().replace('/rocket/23/','/rocket/24/'),body().replace('https://cdn.','https://user:password@cdn.')]) assert.equal(parseSpacePackage(loader(),raw),undefined)
})
test('package ID lookup requires a matching base declaration and creative root in the provider document', () => {
    const url='https://cdn.00px.net/rocket/23/index.html'
    const html='<base href="https://cdn.00px.net/rocket/23/"><div id="banner"></div>'
    assert.equal(spaceDocumentMatches(url,html),true)
    assert.equal(spaceDocumentMatches(url,html.replace('banner','palco')),true)
    for(const body of [html.replace('/23/','/24/'),html.replace('banner','other'),html+'<base href="https://cdn.00px.net/rocket/23/">','<html>Forbidden</html>']) assert.equal(spaceDocumentMatches(url,body),false)
    assert.equal(spaceDocumentMatches(url.replace('cdn.00px.net','127.0.0.1'),html),false)
})
