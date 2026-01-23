#ifndef VSCOPE_H
#define VSCOPE_H

#include <stddef.h>
#include <stdint.h>

#ifndef VSCOPE_MAX_VARIABLES
#define VSCOPE_MAX_VARIABLES 32
#endif

#ifndef VSCOPE_NUM_CHANNELS
#define VSCOPE_NUM_CHANNELS 5
#endif

#ifndef VSCOPE_NAME_LEN
#define VSCOPE_NAME_LEN 16
#endif

#ifndef VSCOPE_BUFFER_SIZE
#define VSCOPE_BUFFER_SIZE 1000
#endif

#ifndef VSCOPE_FRAME_TIMEOUT_US
#define VSCOPE_FRAME_TIMEOUT_US 10000
#endif

#ifndef VSCOPE_RT_BUFFER_LEN
#define VSCOPE_RT_BUFFER_LEN 16
#endif

// User-provided serial TX function (must be implemented in application).
void vscopeTxBytes(const uint8_t* data, size_t len);

// Register a variable for data acquisition.
void vscopeRegisterVar(const char* name, float* ptr);

// Register a real-time buffer variable.
void vscopeRegisterRtBuffer(const char* name, float* ptr);

// Feed raw serial bytes into the parser.
void vscopeFeed(const uint8_t* data, size_t len, uint32_t now_us);

// Initialize the device.
void vscopeInit(const char* device_name, uint16_t isr_khz);

// High speed ISR function to acquire frames.
void vscopeAcquire(void);

// Manually trigger the device.
void vscopeTrigger(void);

// Get a value from the real-time buffer.
float vscopeGetRtBuffer(uint8_t index);

#endif // VSCOPE_H
