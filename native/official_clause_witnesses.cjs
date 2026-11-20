'use strict';
/**
 * Manually linked official English text segments and independently executed
 * behavioral oracle cases. Linkage is explicitly NOT full semantic certification:
 * trigger timing, dynamic target choices and cross-card effects remain open.
 *
 * Independent CI review branch: verify source-pinned clause-level witnesses.\n * Each source hash is pinned to current English text from cyberpunktcg.com.
 * If the publisher revises the card, the link fails closed.
 */
module.exports={
 'japantown-jonin':{
  sourceHash:'d5509f7abe9b9f45402e27204d52a4b93d09ec242d3fb6dc56fbee5cba5080f6',
  segments:[{index:1,hash:'d5509f7abe9b9f45402e27204d52a4b93d09ec242d3fb6dc56fbee5cba5080f6',cases:['play-grants-plus-two-power-to-exactly-one-friend'],branches:['effect-executed']}]},
 'kerry-eurodyne-the-last-rockerboy':{
  sourceHash:'9f3703d039a0f1cdfc55bcfca4da250f1f952dbe3857d9102205dd58f3bfda85',
  segments:[{index:1,hash:'9f3703d039a0f1cdfc55bcfca4da250f1f952dbe3857d9102205dd58f3bfda85',cases:['spend-draws-two-only-with-gig-value-eight-plus'],branches:['below-threshold','at-threshold','spend-ready']}]},
 'royce-don-t-call-me-simon':{
  sourceHash:'d82243d471fcb2d6b64a5effc3dde6db06a8c3406e6fe4f817f7245aeb85d811',
  segments:[
   {index:1,hash:'68a1fa430eacb144ec594db26bc8b706ab6ecf3f06104aa3fb70ef48a17e6f39',cases:['power-three-target-forbidden-when-not-ahead'],branches:['power-two-eligible','power-three-ineligible']},
   {index:2,hash:'df65ae8181bf471eb9809eb88b5e8d1b31f371501cfed6655a3c2da10434f1fc',cases:['power-three-target-allowed-only-when-ahead','power-three-target-forbidden-when-not-ahead'],branches:['condition-false','condition-true']}]},
 'all-is-lost':{
  sourceHash:'464bf807e7b2d6882365e413c8fd2bea42a758377d0b6f90d4ee0e912cfabf64',
  segments:[
   {index:1,hash:'cdb1010ef73b17d0bcf2f8ba57e48e35b1e33177be69a0bbd636ce1ec580d083',cases:['trash-three-choose-unit-without-returning-others','trash-three-no-eligible-unit-does-not-conjure-one'],branches:['trash-three']},
   {index:2,hash:'e37d061b161f5b1f7ec9929a41a176dd5150a246854a6fe7a8276c291661a99e',cases:['trash-three-choose-unit-without-returning-others','trash-three-no-eligible-unit-does-not-conjure-one'],branches:['unit-eligible','no-unit-eligible']}]},
 'shattered-memories':{
  sourceHash:'be8f0e9ce09161cea7103b74d410f6c821103daaf09b792e6042120eff16757f',
  segments:[
   {index:1,hash:'9fe1ab0c317738f80afde5b322a482f42fc694a521d51224103168475c1ccf86',cases:['each-player-may-refuse-five-card-draw','both-draw-five-owner-draws-two-if-discard-total-matches-gig'],branches:['both-decline','both-accept']},
   {index:2,hash:'53d3aabd8f95d0d373ca27e5e0e8bb98c3b2ce0f6889dad5e1cbc8fb8d8c4c4d',cases:['both-draw-five-owner-draws-two-if-discard-total-matches-gig','no-two-card-bonus-with-unmatched-gig-value'],branches:['bonus-condition-true','bonus-condition-false']}]},
 'maxtac-av':{
  sourceHash:'a7b91cd906b3d05a0b5f83406716150204df268a7712f972cba188c617952a29',
  segments:[{index:1,hash:'a7b91cd906b3d05a0b5f83406716150204df268a7712f972cba188c617952a29',cases:['optional-swap-refusal-leaves-ownership-unchanged','optional-swap-acceptance-moves-both-gigs'],branches:['decline','accept']}]},
 'nadia-fighting-through-grief':{
  sourceHash:'307a65587ec4ef0a416958ae2d666524449db3d8445cce5b2b1d9e803205aa1b',
  segments:[{index:1,hash:'307a65587ec4ef0a416958ae2d666524449db3d8445cce5b2b1d9e803205aa1b',cases:['lag-rush-allows-gigs-but-not-units-only-when-behind'],branches:['behind-gig-count','equal-gig-count','only-gigs']}]}
};
