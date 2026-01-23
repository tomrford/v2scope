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

#ifndef VSCOPE_MAX_PAYLOAD
// LEN is 1 byte and includes TYPE + CRC; cap total frame to 256 bytes.
#define VSCOPE_MAX_PAYLOAD 252
#endif

#ifndef VSCOPE_DEVICE_NAME_LEN
#define VSCOPE_DEVICE_NAME_LEN VSCOPE_NAME_LEN
#endif

#ifndef VSCOPE_FRAME_TIMEOUT_US
#define VSCOPE_FRAME_TIMEOUT_US 5000
#endif

#ifndef VSCOPE_RT_BUFFER_LEN
#define VSCOPE_RT_BUFFER_LEN 16
#endif

#ifndef VSCOPE_ASSERT
#define VSCOPE_ASSERT(expr) ((void)0)
#endif

#define VSCOPE_SYNC_BYTE 0xC8
#define VSCOPE_PROTOCOL_VERSION 1

typedef enum {
    VSCOPE_HALTED = 0,
    VSCOPE_RUNNING = 1,
    VSCOPE_ACQUIRING = 2,
    VSCOPE_MISCONFIGURED = 3,
} VscopeState;

typedef enum {
    VSCOPE_TRG_DISABLED = 0,
    VSCOPE_TRG_RISING = 1,
    VSCOPE_TRG_FALLING = 2,
    VSCOPE_TRG_BOTH = 3,
} VscopeTriggerMode;

typedef struct {
    uint32_t crc_fail;
    uint32_t len_invalid;
    uint32_t timeout;
} VscopeErrors;

typedef struct {
    VscopeState state;
    VscopeState request;

    float* frame[VSCOPE_NUM_CHANNELS];
    float buffer[VSCOPE_BUFFER_SIZE][VSCOPE_NUM_CHANNELS];

    uint16_t buffer_size;
    uint32_t n_ch;
    uint32_t divider;
    uint32_t pre_trig;
    uint32_t acq_time;
    uint32_t index;
    uint32_t first_element;
    uint16_t isr_khz;

    float trigger_threshold;
    uint8_t trigger_channel;
    VscopeTriggerMode trigger_mode;

    char device_name[VSCOPE_DEVICE_NAME_LEN];
} VscopeStruct;

extern VscopeStruct vscope;

// User-provided serial TX function (must be implemented in application).
void vscopeTxBytes(const uint8_t* data, size_t len);

// Variable registration (call before vscopeInit()).
#define VSCOPE_REGISTER_VAR(var, display_name) vscopeRegisterVar((display_name), &(var))
#define VSCOPE_REGISTER_BUF(var, display_name) vscopeRegisterRtBuffer((display_name), &(var))
void vscopeRegisterVar(const char* name, float* ptr);
void vscopeRegisterRtBuffer(const char* name, float* ptr);

// Feed raw serial bytes into the parser.
void vscopeFeed(const uint8_t* data, size_t len, uint32_t now_us);

void vscopeInit(const char* device_name, uint16_t isr_khz);
void vscopeAcquire(void);
void vscopeTrigger(void);

VscopeErrors vscopeGetErrors(void);

float vscopeGetRtBuffer(uint8_t index);
void vscopeSetRtBuffer(uint8_t index, float value);

void vscopeSetTriggerThreshold(float threshold);
void vscopeSetTriggerChannel(uint32_t channel);
void vscopeSetTriggerMode(VscopeTriggerMode mode);

#endif // VSCOPE_H
