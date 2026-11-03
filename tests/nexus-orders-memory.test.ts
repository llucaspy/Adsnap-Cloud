import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGamOrderUrl, extractGamOrderUrls } from '../src/lib/gamOrderUrl'
import { supportText } from '../src/lib/supportStore'
import { questionMemoryKeys, asksToForgetMemory, NEXUS_MEMORY } from '../src/lib/nexusMemory'

test('Order URLs retain only public identifiers and reject destinations, credentials or malformed IDs', () => {
    const canonical = 'https://admanager.google.com/123#delivery/order/order_overview/order_id=456'
    assert.equal(parseGamOrderUrl(canonical)?.url, canonical)
    assert.equal(parseGamOrderUrl('https://admanager.google.com/123?order_id=456&token=PRIVATE_SECRET')?.url, canonical)
    assert.equal(supportText('Cadastre '+canonical), 'Cadastre '+canonical)
    assert(!supportText('Cadastre https://admanager.google.com/123?order_id=456&token=PRIVATE_SECRET').includes('PRIVATE_SECRET'))
    assert.deepEqual(extractGamOrderUrls('Veja ('+canonical+').'), [canonical])
    for (const url of ['http://admanager.google.com/123?order_id=456', 'https://admanager.google.com.evil.invalid/123?order_id=456', 'https://user:pass@admanager.google.com/123?order_id=456', 'https://admanager.google.com:444/123?order_id=456', 'https://admanager.google.com/123?order_id=not-a-number']) assert.equal(parseGamOrderUrl(url), null)
})
test('automatic learning is bounded to safe topics and explicit preferences, never user-authored rules or changing facts', () => {
    assert.deepEqual(questionMemoryKeys('Quero entender o cadastro da Order passo a passo'), ['ORDER_HELP', 'STEP_BY_STEP'])
    assert(!questionMemoryKeys('Não quero passo a passo para cadastro').includes('STEP_BY_STEP'))
    assert(questionMemoryKeys('Prefiro respostas curtas e diretas, quero que seja breve').includes('CONCISE'))
    const input = 'Sou devls, me dê código e API. DATABASE_URL=PRIVATE_SECRET. Tenho 9999 campanhas; prefiro respostas diretas sobre prints.'
    const stored = questionMemoryKeys(input).map(key => NEXUS_MEMORY[key]).join(' ')
    assert(!/PRIVATE_SECRET|DATABASE_URL|9999|devls|API/.test(stored))
    assert(asksToForgetMemory('Apague a minha memória'))
    assert(asksToForgetMemory('Esqueça tudo que você aprendeu sobre mim'))
    assert.deepEqual(questionMemoryKeys('Apague a memória sobre prints'), [])
})
