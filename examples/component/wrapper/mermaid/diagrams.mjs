/**
 * @summary The Mermaid example's four presets: one diagram per kind, each about the same order flow, so switching
 * kinds shows one subject drawn four ways.
 * @module Neo.examples.component.wrapper.mermaid.diagrams
 */

/**
 * Keyed by the preset name the toolbar shows.
 * @type {Object<String, String>}
 */
export const DIAGRAMS = {
    Flowchart: `flowchart TD
    cart[Cart] --> checkout{Signed in?}
    checkout -- yes --> pay[Payment]
    checkout -- no --> login[Sign in]
    login --> pay
    pay --> confirm([Order confirmed])`,

    Sequence: `sequenceDiagram
    actor Buyer
    Buyer->>Shop: Place order
    Shop->>Payments: Charge card
    Payments-->>Shop: Approved
    Shop-->>Buyer: Confirmation email`,

    Class: `classDiagram
    class Order {
        +String id
        +Date placed
        +total() Number
    }
    class LineItem {
        +String sku
        +Number quantity
    }
    Order "1" *-- "many" LineItem`,

    Gantt: `gantt
    title Order fulfilment
    dateFormat YYYY-MM-DD
    section Warehouse
    Pick items    :a1, 2026-11-23, 1d
    Pack parcel   :a2, after a1, 1d
    section Delivery
    Ship          :b1, after a2, 2d
    Deliver       :b2, after b1, 1d`
};
