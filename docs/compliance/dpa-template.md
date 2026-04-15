# Data Processing Agreement (DPA)

**Version 1.0** — effective {{effective_date}}

> **Not legal advice.** This template is provided for convenience. It must be reviewed, edited, and approved by a qualified EU data protection lawyer before being executed with any customer. BizAssist makes no representation that this document satisfies the requirements of any specific jurisdiction.

---

## 1. Parties

This Data Processing Agreement ("**DPA**") is entered into between:

- **{{controller_legal_name}}**, a company incorporated in **{{controller_country}}**, with its registered office at **{{controller_address}}** (the "**Controller**"), and
- **{{processor_legal_name}}** (trading as "BizAssist"), with its registered office at **{{processor_address}}** (the "**Processor**").

Each a "**Party**" and together the "**Parties**".

This DPA forms part of, and is subject to, the Subscription Agreement between the Parties dated **{{main_agreement_date}}** (the "**Main Agreement**"). Defined terms not otherwise defined in this DPA have the meaning given in the Main Agreement or in the EU General Data Protection Regulation 2016/679 ("**GDPR**").

## 2. Subject matter and duration

The Processor processes personal data on behalf of the Controller for the sole purpose of providing the BizAssist chatbot service as described in the Main Agreement. Processing continues for the duration of the Main Agreement and the short retention tail set out in Section 10.

## 3. Nature and purpose of processing

The Processor will process personal data only to:

1. Deliver AI-generated responses to the Controller's end-customers on the Controller's configured knowledge base,
2. Store conversation transcripts so the Controller can review them in the dashboard,
3. Optionally capture lead details (email, phone, name) when the Controller enables lead capture,
4. Operate the five-layer safety pipeline (prompt injection classifier, content moderation, PII detection, output validation, security event logging),
5. Generate aggregate analytics for the Controller's dashboard,
6. Apply the retention and deletion policies configured by the Controller.

## 4. Categories of data subjects

- End-customers of the Controller who interact with the chatbot,
- Authorised dashboard users of the Controller (admins and operators).

## 5. Categories of personal data

- Chat message content (text the end-customer types into the widget),
- Session identifiers and device / browser metadata,
- Where enabled: email address, phone number, name, and any other information the end-customer voluntarily shares,
- Dashboard user email addresses and authentication metadata.

## 6. Obligations of the Processor

The Processor undertakes to:

1. Process personal data only on documented instructions from the Controller, including transfers to third countries (see Section 9), unless required to do so by Union or Member State law,
2. Ensure that persons authorised to process the personal data are subject to confidentiality obligations,
3. Take all measures required under Article 32 GDPR — see `security-measures.md` for the current technical and organisational measures,
4. Assist the Controller with Data Subject Rights requests (see Section 8) and with Articles 32–36 obligations,
5. Notify the Controller of any personal data breach without undue delay, per Section 11,
6. Make available all information necessary to demonstrate compliance with Article 28 GDPR, and allow for reasonable audits conducted once per calendar year.

## 7. Sub-processors

The Processor uses the sub-processors listed in `sub-processors.md` and in the dashboard under **Compliance → Sub-processors**. The Controller hereby provides general written authorisation for these sub-processors.

The Processor will provide at least **30 days' notice** of any intended changes concerning the addition or replacement of sub-processors. The Controller may object to such changes on reasonable grounds; if the Parties cannot reach agreement, the Controller may terminate the Main Agreement without penalty.

## 8. Data Subject Rights

The Processor provides in-product tooling (the Compliance dashboard and the `/api/compliance/sar/*` endpoints) enabling the Controller to:

- Export all personal data relating to a specific data subject (GDPR Article 15),
- Erase all personal data relating to a specific data subject (GDPR Article 17),
- Export all personal data relating to the Controller's tenant.

Where the Processor receives a request directly from a data subject, it will redirect the request to the Controller without undue delay.

## 9. International transfers

Some sub-processors (currently OpenAI and Anthropic) are located in the United States. Personal data transferred to these sub-processors is protected by the **Standard Contractual Clauses** (Commission Implementing Decision (EU) 2021/914) incorporated by reference into the respective sub-processor DPAs.

The Controller may pin its tenant to the European Union region in the Compliance dashboard. When EU-pinned, primary storage (Supabase, Pinecone) operates in the EU; language model calls still transit to the United States.

## 10. Retention and deletion

The Controller configures retention windows in the Compliance dashboard for:

- Conversation transcripts (default **365 days**),
- Lead records (default **730 days**),
- Security events (default **180 days**).

Data exceeding these windows is deleted automatically by the retention job. Setting a window to `0` retains the data until explicit deletion.

Upon termination of the Main Agreement, the Processor will delete or return all personal data to the Controller within **30 days**, unless Union or Member State law requires further retention.

## 11. Personal data breach notification

The Processor will notify the Controller of any personal data breach without undue delay and **no later than 48 hours** after becoming aware of it. The notification will include, to the extent available:

1. The nature of the breach including the categories and approximate number of data subjects and records affected,
2. The likely consequences,
3. Measures taken or proposed to address the breach,
4. A point of contact for further information.

See `breach-procedure.md` for the internal runbook.

## 12. Audits

The Controller may, at its own expense, conduct an audit of the Processor's compliance with this DPA no more than **once per calendar year**, upon at least **30 days' written notice**. The Parties will agree the scope and methodology in advance and will not disrupt the Processor's normal operations.

## 13. Liability

The liability of each Party under this DPA is subject to the limitations of liability set out in the Main Agreement.

## 14. Governing law

This DPA is governed by the law of **{{governing_law}}** and the courts of **{{jurisdiction}}** have exclusive jurisdiction.

## 15. Signatures

| Controller | Processor |
|------------|-----------|
| Name: {{controller_signatory_name}} | Name: {{processor_signatory_name}} |
| Title: {{controller_signatory_title}} | Title: {{processor_signatory_title}} |
| Date: {{controller_signature_date}} | Date: {{processor_signature_date}} |

---

## Annex A — Technical and organisational measures

See `security-measures.md`.

## Annex B — Sub-processors

See `sub-processors.md`.
