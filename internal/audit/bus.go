// Package audit ships policy decisions to a sink without blocking the request
// path. Halberd's hot loop calls bus.Record from the proxy handler; the bus
// owns a buffered channel and a single goroutine that drains it to JSONL on
// disk. Dropping on overflow is preferred to blocking the proxy.
package audit

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

type Event struct {
	Time       time.Time   `json:"time"`
	Direction  string      `json:"direction"`
	Method     string      `json:"method,omitempty"`
	Tool       string      `json:"tool,omitempty"`
	Blocked    bool        `json:"blocked"`
	Violations interface{} `json:"violations,omitempty"`
	RemoteAddr string      `json:"remote_addr,omitempty"`
}

type Bus struct {
	ch       chan Event
	dropped  atomic.Uint64
	sink     io.Writer
	wg       sync.WaitGroup
	stopOnce sync.Once
}

func NewBus(sink io.Writer, buf int) *Bus {
	if buf <= 0 {
		buf = 1024
	}
	b := &Bus{
		ch:   make(chan Event, buf),
		sink: sink,
	}
	b.wg.Add(1)
	go b.drain()
	return b
}

func (b *Bus) Record(e Event) {
	if e.Time.IsZero() {
		e.Time = time.Now().UTC()
	}
	select {
	case b.ch <- e:
	default:
		b.dropped.Add(1)
	}
}

func (b *Bus) Dropped() uint64 {
	return b.dropped.Load()
}

func (b *Bus) Stop(ctx context.Context) error {
	b.stopOnce.Do(func() {
		close(b.ch)
	})
	done := make(chan struct{})
	go func() {
		b.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (b *Bus) drain() {
	defer b.wg.Done()
	enc := json.NewEncoder(b.sink)
	for ev := range b.ch {
		if err := enc.Encode(ev); err != nil {
			slog.Error("audit sink write failed", "error", err)
		}
	}
}
