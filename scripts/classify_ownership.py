#!/usr/bin/env python3
"""Classify who owns each shortlisted company: the same typed decision the SBA loan screen used, through a pluggable provider.

One decision per company, over eight labels, with a probability for each:
  founder_led, family_next_generation, employee_or_partner_owned, pe_backed_or_acquired, franchise_unit,
  closed_or_inactive, not_in_segment, unknown
The input is what the loan records say about the company (name, place, trade, jobs, SBA loans) plus the public evidence
already gathered for it (claims with source URLs: company site, state records, press, news, search snippets). The provider
judges only that evidence; it does not browse.

Providers
  anthropic  Claude through the Anthropic Python SDK (pip install anthropic). Model claude-opus-5-5, adaptive thinking (always
             on for this model) at effort "high", structured output (output_config.format, a JSON schema listing the eight
             labels and their probabilities) and server-side refusal fallbacks (fallbacks="default"). Needs ANTHROPIC_API_KEY
             (or an `ant auth login` profile, only with --use-cli-profile) and --send.
  jev        Jev, TypeSafe AI's System One model: POST https://api.typesafe.ai/v1/systemone with
             "Authorization: Bearer $TYPESAFE_API_KEY", a state and one Choice question whose criteria are the eight labels.
             The answer carries choice, probabilities and confidence. Request shape from the public docs:
             https://docs.typesafe.ai/introduction/quickstart.md (Call it: the API) and
             https://docs.typesafe.ai/primitives/choice.md. Standard library only (urllib).

Output: an enrichment file in the shape scripts/build_ma_ppp_screen.py reads ({items:[{cid, dec, wdec, p, ...}]}); the
independent re-check of founder-led and family calls is a separate step and is not done here.

Usage
  python3 scripts/classify_ownership.py --candidates ppp_candidates.json --evidence evidence.json --provider anthropic
  python3 scripts/classify_ownership.py --candidates ppp_candidates.json --evidence evidence.json --provider jev --send --out decisions.json
--provider is required (no default). Without --send the script is a dry run: it prints each request it would send and
nothing leaves the machine. Company data (names, places, jobs, evidence) is sent to the chosen provider only with --send,
and only when that provider has an explicit key: ANTHROPIC_API_KEY for anthropic (an ambient `ant auth login` profile is
not used unless --use-cli-profile is also given), TYPESAFE_API_KEY for jev.

Evidence file: {items:[{cid, ev:[[claim, url, type], ...]}]} (the enrichment file format), or {items:[{cid, evidence:[{claim, url, type}]}]}.
"""
import argparse, json, os, sys, urllib.request, urllib.error

LABELS = ['founder_led', 'family_next_generation', 'employee_or_partner_owned', 'pe_backed_or_acquired', 'franchise_unit', 'closed_or_inactive', 'not_in_segment', 'unknown']
LABEL_TEXT = {
    'founder_led': 'Founder-led: the person or people who started the company still own and run it, with no sale, parent company or outside investor found.',
    'family_next_generation': 'Family, next generation: owned and run by the founding family after the founder, such as a son, daughter or later generation, with no sale or investor found.',
    'employee_or_partner_owned': 'Employee or partner-owned: an ESOP, or several non-family partners own it.',
    'pe_backed_or_acquired': 'Sponsor-backed or acquired: owned by a private-equity firm, a roll-up or another company, or sold.',
    'franchise_unit': 'Franchise unit: a franchisee operating under a franchisor brand.',
    'closed_or_inactive': 'Closed or inactive: the business no longer operates.',
    'not_in_segment': 'Out of segment: the business does not do the work this screen looks for (for example commercial or new-construction work in a residential-service screen).',
    'unknown': 'Unknown: the evidence does not show who owns it.',
}
SEGMENT_TEXT = {
    'pp': 'Residential HVAC, plumbing and electrical service and replacement for homeowners, near Lancaster PA or Toms River NJ.',
    'cet': 'New England electrical construction, solar, EV charging, energy efficiency, or water, sewer and pump-station contracting.',
    'fl': 'Managed IT or revenue-cycle services for law firms (a visible legal-industry focus is required).',
    'ts': 'Laboratory, scientific or cleanroom supply and equipment distribution.',
    'bpi': 'Public affairs, public relations and communications, or public-opinion research.',
    'fh': 'A branded consumer apparel or swim company (not contract sewing).',
}
SYSTEM = ('You classify the ownership of small private companies for an acquisition screen. Judge only the evidence given; if it does '
          'not settle a question, say so through the probabilities and the unknown label. A founder or family label needs evidence that '
          'no sale, parent company or investor exists, not only an old article. Give a probability for every label; they must sum to 1. '
          'A careers or job portal that runs on a roll-up\'s applicant-tracking account (for example a careers-<company>.icims.com page '
          'whose job metadata names Apex Service Partners, Sila, Wrench Group or another acquirer as the company) shows the company '
          'belongs to that acquirer: label it pe_backed_or_acquired. '
          'Keep each reason to one or two plain sentences and name the evidence it rests on.')
SCHEMA = {
    'type': 'object',
    'properties': {
        'decision': {'type': 'string', 'enum': LABELS},
        'probabilities': {'type': 'object', 'properties': {k: {'type': 'number'} for k in LABELS}, 'required': LABELS, 'additionalProperties': False},
        'in_segment': {'type': 'boolean'},
        'operating': {'type': 'string', 'enum': ['yes', 'no', 'unclear']},
        'reason': {'type': 'string'},
        'succession_signal': {'type': 'string'},
    },
    'required': ['decision', 'probabilities', 'in_segment', 'operating', 'reason', 'succession_signal'],
    'additionalProperties': False,
}
MODEL = 'claude-opus-5-5'
JEV_URL = 'https://api.typesafe.ai/v1/systemone'
JEV_DOCS = 'https://docs.typesafe.ai/introduction/quickstart.md'


def load_companies(path, cids=None, segment=None, limit=None):
    d = json.load(open(path, encoding='utf-8'))
    rows = d.get('shortlist') if isinstance(d, dict) else d
    rows = [r for r in rows or [] if (not cids or r.get('cid') in cids) and (not segment or r.get('segment') == segment)]
    return rows[:limit] if limit else rows


def load_evidence(path):
    if not path: return {}
    out = {}
    for it in json.load(open(path, encoding='utf-8')).get('items', []):
        ev = it.get('evidence')
        if ev is None:
            ev = [{'claim': c, 'url': u, 'type': t} for c, u, t in it.get('ev') or []]
        out[it['cid']] = ev
    return out


def state_for(c, evidence):
    """The facts one decision is made on: the loan record and the gathered evidence (a structured object, for both providers)."""
    return {
        'company': c.get('name'), 'doing_business_as': c.get('dba') or None, 'city': c.get('city'), 'state': c.get('state'),
        'industry_code': c.get('naics'), 'segment_sought': SEGMENT_TEXT.get(c.get('segment'), ''),
        'jobs': {'latest': c.get('jobs_latest'), 'source': c.get('jobs_latest_source')},
        'sba_loans': {'latest': c.get('sba_latest_loan'), 'change_of_ownership_date': c.get('change_of_ownership') or None},
        'evidence': [{'claim': e.get('claim'), 'source_url': e.get('url'), 'source_type': e.get('type')} for e in evidence],
    }


# ── provider: anthropic ──────────────────────────────────────────────────────
def anthropic_request(state):
    return {
        'model': MODEL, 'max_tokens': 16000,
        'betas': ['server-side-fallback-2026-07-01'], 'fallbacks': 'default',
        'output_config': {'effort': 'high', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        'system': SYSTEM + '\n\nLabels:\n' + '\n'.join(f'- {k}: {v}' for k, v in LABEL_TEXT.items()),
        'messages': [{'role': 'user', 'content': 'Classify the ownership of this company.\n\n' + json.dumps(state, ensure_ascii=False, indent=1)}],
    }


def anthropic_call(req, client):
    import anthropic
    try:
        r = client.beta.messages.create(**req)
    except anthropic.RateLimitError as e:
        raise RuntimeError(f'rate limited: {e}') from e
    except anthropic.APIStatusError as e:
        raise RuntimeError(f'API error {e.status_code}: {e.message}') from e
    except anthropic.APIConnectionError as e:
        raise RuntimeError(f'connection error: {e}') from e
    if r.stop_reason == 'refusal':
        cat = getattr(r.stop_details, 'category', None) if r.stop_details else None
        return {'decision': 'unknown', 'probabilities': {k: (1.0 if k == 'unknown' else 0.0) for k in LABELS}, 'in_segment': None,
                'operating': 'unclear', 'reason': f'Declined by the model (category {cat}).', 'succession_signal': ''}
    if r.stop_reason == 'max_tokens':
        raise RuntimeError('response hit max_tokens before the JSON was complete')
    text = next(b.text for b in r.content if b.type == 'text')
    return json.loads(text)


# ── provider: jev ────────────────────────────────────────────────────────────
def jev_request(state, model='jev-latest'):
    return {
        'state': state, 'model': model,
        'questions': {
            'ownership': {'type': 'choice', 'instructions': 'Who owns and runs this company, judged only from the evidence in the state', 'criteria': LABEL_TEXT},
            'in_segment': {'type': 'noul', 'instructions': 'The company does the work described in segment_sought'},
            'operating': {'type': 'noul', 'instructions': 'The company is still operating'},
        },
    }


def jev_call(body):
    key = os.environ.get('TYPESAFE_API_KEY')
    if not key:
        raise RuntimeError('TYPESAFE_API_KEY is not set (get a key at https://console.typesafe.ai/keys)')
    req = urllib.request.Request(JEV_URL, data=json.dumps(body).encode('utf-8'), method='POST',
                                 headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'Jev API error {e.code}: {e.read()[:300]!r}') from e
    a = out['answers']
    own = a['ownership']
    probs = {k: float(own.get('probabilities', {}).get(k, 0.0)) for k in LABELS}
    seg, op = a.get('in_segment', {}).get('noul'), a.get('operating', {}).get('noul')
    return {'decision': own['choice'], 'probabilities': probs, 'in_segment': None if seg is None else seg >= 0.5,
            'operating': 'unclear' if op is None else 'yes' if op >= 0.7 else 'no' if op <= 0.3 else 'unclear',
            'reason': f"Jev ({out.get('model')}) confidence {own.get('confidence')}", 'succession_signal': '', 'confidence': own.get('confidence')}


def to_enrichment(c, ans, evidence, provider):
    """One item in the enrichment-file shape build_ma_ppp_screen.py reads (no re-check: ver stays null)."""
    p = ans['probabilities']; s = sum(p.get(k, 0) for k in LABELS) or 1.0
    return {'cid': c['cid'], 'wdec': ans['decision'], 'dec': ans['decision'], 'p': [round(p.get(k, 0) / s, 3) for k in LABELS],
            'seg': ans.get('in_segment'), 'op': ans.get('operating'), 'fit': ans.get('reason'), 'succ': ans.get('succession_signal') or None,
            'ev': [[e.get('claim'), e.get('url'), e.get('type')] for e in evidence], 'ver': None, 'provider': provider}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--candidates', required=True, help='ppp_candidates.json (its shortlist) or a JSON list of company rows')
    ap.add_argument('--evidence', help='evidence per company (enrichment-file format)')
    ap.add_argument('--provider', choices=['anthropic', 'jev'], required=True, help='required; there is no default provider')
    ap.add_argument('--segment', choices=list(SEGMENT_TEXT))
    ap.add_argument('--cid', action='append', help='only these companies (repeatable)')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--jev-model', default='jev-latest')
    ap.add_argument('--out', help='write decisions here (enrichment-file format); default stdout')
    ap.add_argument('--send', action='store_true', help='actually send company data to the provider; without it the run is a dry run')
    ap.add_argument('--use-cli-profile', action='store_true', help='anthropic only: allow an `ant auth login` profile when ANTHROPIC_API_KEY is not set')
    ap.add_argument('--dry-run', action='store_true', help='print the requests and stop (the default unless --send is given)')
    a = ap.parse_args(argv)
    if not a.send:
        a.dry_run = True
    if not a.dry_run:
        key_env = 'ANTHROPIC_API_KEY' if a.provider == 'anthropic' else 'TYPESAFE_API_KEY'
        if not os.environ.get(key_env) and not (a.provider == 'anthropic' and a.use_cli_profile):
            print(f'--send needs an explicit key for {a.provider}: set {key_env}'
                  + (' (or pass --use-cli-profile to use an `ant auth login` profile)' if a.provider == 'anthropic' else '')
                  + '. Nothing was sent.', file=sys.stderr)
            return 2
    comps = load_companies(a.candidates, set(a.cid or []), a.segment, a.limit)
    ev = load_evidence(a.evidence)
    if not comps:
        print('no companies matched', file=sys.stderr); return 1
    client = None
    if not a.dry_run and a.provider == 'anthropic':
        import anthropic
        client = anthropic.Anthropic()   # ANTHROPIC_API_KEY (checked above), or the CLI profile when --use-cli-profile was given
    out = []
    for c in comps:
        e = ev.get(c['cid'], [])
        state = state_for(c, e)
        if a.provider == 'anthropic':
            req = anthropic_request(state)
            if a.dry_run:
                print(json.dumps({'provider': 'anthropic', 'cid': c['cid'], 'call': 'client.beta.messages.create', 'request': req}, ensure_ascii=False, indent=1)); continue
            ans = anthropic_call(req, client)
        else:
            body = jev_request(state, a.jev_model)
            if a.dry_run:
                print(json.dumps({'provider': 'jev', 'cid': c['cid'], 'method': 'POST', 'url': JEV_URL,
                                  'headers': {'Authorization': 'Bearer $TYPESAFE_API_KEY', 'Content-Type': 'application/json'}, 'body': body, 'docs': JEV_DOCS},
                                 ensure_ascii=False, indent=1)); continue
            ans = jev_call(body)
        if ans.get('decision') not in LABELS:
            raise RuntimeError(f"{c['cid']}: unexpected label {ans.get('decision')!r}")
        out.append(to_enrichment(c, ans, e, a.provider))
        print(f"{c['cid']}: {ans['decision']}", file=sys.stderr)
    if a.dry_run:
        return 0
    res = {'_note': f'Ownership decisions from scripts/classify_ownership.py ({a.provider}); not yet re-checked.', 'items': out}
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as fh: json.dump(res, fh, ensure_ascii=False, indent=1)
    else:
        print(json.dumps(res, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
