# url-shortener-analytics Architecture

## System Diagram
The following Mermaid.js sequence diagram maps the core workflow and interactions:

```mermaid
sequenceDiagram
    client->>API: POST /shorten
API->>In-Memory LRU Cache / Node.js Maps: Cache check
API->>SQLite: Save URL
API-->>client: return short_url
API-)Embedded Event Emitter / Batching Queue: Publish Analytics Event
```

## Component Breakdown
- **Core Technology**: Node.js, Embedded Event Emitter / Batching Queue
- **Design Paradigm**: Emphasizes high availability, fault tolerance, and security.

## Security & Scaling Considerations
- Strict boundary validations.
- Horizontal scalability achieved via stateless workers.
- Encrypted data at rest and in transit.
