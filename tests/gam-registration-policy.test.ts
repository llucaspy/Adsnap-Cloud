import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inferOrderCampaignType, orderRegistrationPolicy } from '../src/lib/gamRegistrationPolicy'

test('new Orders default private/daily and gov always selects federal/boundary', () => {
    assert.deepEqual(orderRegistrationPolicy(), { segmentation: 'PRIVADO', captureCadence: 'DAILY' })
    assert.deepEqual(orderRegistrationPolicy('GOV_FEDERAL'), { segmentation: 'GOV_FEDERAL', captureCadence: 'BOUNDARY' })
    assert.equal(inferOrderCampaignType(['Cadastre uma order como gov']), 'GOV_FEDERAL')
    assert.equal(inferOrderCampaignType(['https://admanager.google.com/123#delivery/order/order_overview/order_id=456', 'Quero cadastrar uma Order de governo federal']), 'GOV_FEDERAL')
    assert.equal(inferOrderCampaignType(['Cadastre outra Order', 'Cadastre uma campanha gov']), 'PRIVADO')
    assert.equal(inferOrderCampaignType(['Não privada, cadastre como gov']), 'GOV_FEDERAL')
    assert.equal(inferOrderCampaignType(['Cadastre como privada']), 'PRIVADO')
    assert.equal(inferOrderCampaignType(['https://admanager.google.com/123#delivery/order/order_overview/order_id=456', 'gov', 'Quero cadastrar uma order']), 'GOV_FEDERAL')
})
