# url-shortener-analytics Architecture

## System Diagram
The following Mermaid.js sequence diagram maps the core workflow and interactions:

```mermaid
sequenceDiagram
    client->>API: POST /shorten
API->>Redis: Cache check
API->>Postgres: Save URL
API-->>client: return short_url
API-)Kafka: Publish Analytics Event
```

## Component Breakdown
- **Core Technology**: Node.js, Kafka
- **Design Paradigm**: Emphasizes high availability, fault tolerance, and security.

## Security & Scaling Considerations
- Strict boundary validations.
- Horizontal scalability achieved via stateless workers.
- Encrypted data at rest and in transit.
