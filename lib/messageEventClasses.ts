
import { MessageId } from "./types";

/**
 * Represents a FIFO queue
 */
export class Queue<T> {
    private _queue: T[] = [];

    /**
     * Returns the number of items in the queue
     */
    get length(): number {
        return this._queue.length;
    }

    /**
     * Adds an item to the queue
     * @param item The item to add to the queue
     */
    enqueue(item: T): void {
        this._queue.push(item);
    }

    /**
     * Removes an item from the queue
     * @returns The item removed from the queue
     */
    dequeue(): T | undefined {
        const item = this._queue.shift();
        return item;
    }

    /**
     * Returns the item at the front of the queue without removing it
     * @returns The item at the front of the queue
     */
    peek(): T | undefined {
        return this._queue[0];
    }

    /**
     * Returns true if the queue is empty
     * @returns True if the queue is empty
     */
    isEmpty(): boolean {
        return this._queue.length === 0;
    }
}

/**
 * Represents a message event
 */
export class MessageEvent {
    private _id: MessageId;
    private _queueMap: Map<MessageId, Queue<MessageEvent>>;
    private _call: () => Promise<void>;

    /**
     * Creates a new MessageEvent
     * @param id Message ID tied to this event
     * @param queue Queue that this event is in
     * @param call Function to call when this event is called
     */
    constructor(
        id: MessageId,
        eventQueueMap: Map<MessageId, Queue<MessageEvent>>,
        call: () => Promise<void>
    ) {
        this._id = id;
        this._queueMap = eventQueueMap;
        this._call = call;
    }

    /**
     * Runs this event, then calls the next event in the queue
     */
    async call() {
        await this._call();
        this.next();
    }

    /**
     * Calls the next event in the queue
     */
    next() {
        // Get queue
        const queue = this.queue();
        if (!queue) return;
        // Dequeue self
        queue.dequeue();
        // Call next event in queue
        const nextEvent = queue.peek();
        if (nextEvent) nextEvent.call();
        // Delete queue if empty
        else this._queueMap.delete(this._id);
    }

    /**
     * Returns the queue that this event is in
     * @returns The queue that this event is in
     */
    queue() {
        return this._queueMap.get(this._id);
    }

    /**
     * Returns the map of queues
     * @returns The map of queues
     */
    queueMap() {
        return this._queueMap;
    }

    get id() {
        return this._id;
    }
}
